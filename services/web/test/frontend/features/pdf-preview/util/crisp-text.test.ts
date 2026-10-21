import { expect } from 'chai'

import {
  CrispCanvasFactory,
  defaultTextRendering,
  drawingCrispText,
  fitCanvasToScreen,
  isPdfTextRendering,
  snapGlyphOrigins,
} from '../../../../../frontend/js/features/pdf-preview/util/crisp-text'
import {
  TEXT_GAMMA,
  averageRows,
  downsample3x,
  processStrip,
} from '../../../../../frontend/js/features/pdf-preview/util/crisp-pixels'

const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'

// RGBA pixels from [r, g, b] triples
function pixels(...rgb: number[][]) {
  const out = new Uint8ClampedArray(rgb.length * 4)
  rgb.forEach(([r, g, b], i) => out.set([r, g, b, 255], i * 4))
  return out
}

// a row of samples: '.' is white, 'b' is black
function samples(pattern: string) {
  return pixels(
    ...Array.from(pattern, ch => (ch === 'b' ? [0, 0, 0] : [255, 255, 255]))
  )
}

function pixelAt(data: Uint8ClampedArray, i: number) {
  return Array.from(data.slice(i * 4, i * 4 + 3))
}

describe('crisp-text', function () {
  describe('defaultTextRendering', function () {
    it('uses ClearType on Windows at normal pixel density', function () {
      expect(defaultTextRendering(WIN, 1)).to.equal('crisp-cleartype')
      expect(defaultTextRendering(WIN, 1.25)).to.equal('crisp-cleartype')
      expect(defaultTextRendering(WIN, 1.5)).to.equal('crisp-cleartype')
    })

    it('uses grayscale crisp text on high density screens and elsewhere', function () {
      expect(defaultTextRendering(WIN, 2)).to.equal('crisp')
      expect(defaultTextRendering(MAC, 2)).to.equal('crisp')
      expect(defaultTextRendering(MAC, 1)).to.equal('crisp')
      expect(defaultTextRendering(LINUX, 1)).to.equal('crisp')
    })
  })

  it('recognises valid modes only', function () {
    expect(isPdfTextRendering('standard')).to.equal(true)
    expect(isPdfTextRendering('crisp')).to.equal(true)
    expect(isPdfTextRendering('crisp-cleartype')).to.equal(true)
    expect(isPdfTextRendering('bold')).to.equal(false)
    expect(isPdfTextRendering(null)).to.equal(false)
  })

  describe('fitCanvasToScreen', function () {
    let savedRatio: PropertyDescriptor | undefined

    function setRatio(ratio: number) {
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        value: ratio,
      })
    }

    beforeEach(function () {
      savedRatio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
    })

    afterEach(function () {
      if (savedRatio)
        Object.defineProperty(window, 'devicePixelRatio', savedRatio)
      else delete (window as any).devicePixelRatio
    })

    it('gives the canvas the page size in screen pixels at 112.5%', function () {
      // what PDFViewer does at 1.125: 8/7 instead of 9/8, 696 x 984 for a
      // page of 616 x 875 CSS pixels shown at 693 x 984.375
      setRatio(1.125)
      const canvas = { width: 696, height: 984 }
      const t = fitCanvasToScreen(canvas, [696 / 616, 0, 0, 984 / 875, 0, 0])
      expect(canvas).to.deep.equal({ width: 693, height: 984 })
      expect(t[0]).to.be.closeTo(693 / 616, 1e-12)
      expect(t[3]).to.be.closeTo(984 / 875, 1e-12)
      expect(t[4]).to.equal(0)
      expect(t[5]).to.equal(0)
    })

    it('leaves a canvas that already fits alone', function () {
      setRatio(1.25)
      const canvas = { width: 770, height: 1100 }
      const given = [1.25, 0, 0, 1.25, 0, 0]
      expect(fitCanvasToScreen(canvas, given)).to.equal(given)
      expect(canvas).to.deep.equal({ width: 770, height: 1100 })
    })

    it('leaves zoomed-in detail views alone', function () {
      setRatio(1.125)
      const canvas = { width: 696, height: 984 }
      const given = [696 / 616, 0, 0, 984 / 875, -120, -300]
      expect(fitCanvasToScreen(canvas, given)).to.equal(given)
      expect(canvas).to.deep.equal({ width: 696, height: 984 })
    })
  })

  describe('TEXT_GAMMA', function () {
    it('keeps white and black, darkens mid-tones monotonically', function () {
      expect(TEXT_GAMMA[255]).to.equal(255)
      expect(TEXT_GAMMA[0]).to.equal(0)
      expect(TEXT_GAMMA[128]).to.be.below(128)
      for (let v = 1; v < 256; v++) {
        expect(TEXT_GAMMA[v]).to.be.at.least(TEXT_GAMMA[v - 1])
      }
    })
  })

  describe('averageRows', function () {
    it('averages every vs rows into one', function () {
      // 1 pixel wide, 2 output rows, vs = 2
      const white = [255, 255, 255]
      const tall = pixels([100, 0, 255], [200, 50, 255], white, white)
      const out = averageRows(tall, 1, 2, 2)
      expect(pixelAt(out, 0)).to.deep.equal([150, 25, 255])
      expect(pixelAt(out, 1)).to.deep.equal([255, 255, 255])
    })
  })

  describe('downsample3x', function () {
    it('keeps white as white', function () {
      const src = samples('.........')
      const dst = new Uint8ClampedArray(3 * 4)
      downsample3x(src, dst, 3, 1, true)
      for (let x = 0; x < 3; x++) {
        expect(pixelAt(dst, x)).to.deep.equal([255, 255, 255])
      }
    })

    it('averages the three samples to gray without ClearType', function () {
      // middle pixel: one black sample of three
      const src = samples('...b.....')
      const dst = new Uint8ClampedArray(3 * 4)
      downsample3x(src, dst, 3, 1, false)
      const expected = TEXT_GAMMA[170]
      expect(pixelAt(dst, 1)).to.deep.equal([expected, expected, expected])
    })

    it('spreads a pixel-aligned stem symmetrically over subpixels with ClearType', function () {
      // middle pixel fully black
      const src = samples('...bbb...')
      const dst = new Uint8ClampedArray(3 * 4)
      downsample3x(src, dst, 3, 1, true)
      const [r, g, b] = pixelAt(dst, 1)
      expect(r).to.equal(b)
      expect(g).to.be.below(r)
      // the filter leaks a little colour into the neighbours
      const [lr, , lb] = pixelAt(dst, 0)
      expect(lb).to.be.below(lr)
    })
  })

  describe('processStrip', function () {
    // straightforward implementation of the same maths, without shortcuts
    function referenceStrip(
      tall: Uint8ClampedArray,
      width: number,
      rows: number,
      vs: number,
      lcd: boolean
    ) {
      const w3 = width * 3
      const shift = Math.log2(vs)
      const avg = new Uint8ClampedArray(w3 * rows * 4)
      for (let y = 0; y < rows; y++) {
        for (let i = 0; i < w3; i++) {
          for (let c = 0; c < 4; c++) {
            let sum = 0
            for (let k = 0; k < vs; k++) {
              sum += tall[((y * vs + k) * w3 + i) * 4 + c]
            }
            avg[(y * w3 + i) * 4 + c] = (sum + (vs >> 1)) >> shift
          }
        }
      }
      const fir = [8, 77, 86, 77, 8]
      const out = new Uint8ClampedArray(width * rows * 4)
      for (let y = 0; y < rows; y++) {
        const row = y * w3
        for (let x = 0; x < width; x++) {
          for (let c = 0; c < 3; c++) {
            let v
            if (lcd) {
              let acc = 0
              for (let k = -2; k <= 2; k++) {
                const t = Math.min(w3 - 1, Math.max(0, 3 * x + c + k))
                acc += fir[k + 2] * avg[(row + t) * 4 + c]
              }
              v = (acc + 128) >> 8
            } else {
              let sum = 0
              for (let k = 0; k < 3; k++) sum += avg[(row + 3 * x + k) * 4 + c]
              v = Math.round(sum / 3)
            }
            out[(y * width + x) * 4 + c] = TEXT_GAMMA[v]
          }
          out[(y * width + x) * 4 + 3] = 255
        }
      }
      return out
    }

    // mostly white work canvas with ink, like a page of text
    function randomStrip(
      width: number,
      rows: number,
      vs: number,
      seed: number
    ) {
      let state = seed
      const random = () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff
        return state / 0x7fffffff
      }
      const tall = new Uint8ClampedArray(width * 3 * rows * vs * 4)
      for (let i = 0; i < tall.length; i += 4) {
        const blankRow = Math.floor(i / 4 / (width * 3 * vs)) % 3 === 0
        const ink = !blankRow && random() < 0.3
        tall[i] = ink ? Math.floor(random() * 256) : 255
        tall[i + 1] = ink ? Math.floor(random() * 256) : 255
        tall[i + 2] = ink ? Math.floor(random() * 256) : 255
        tall[i + 3] = 255
      }
      return tall
    }

    for (const vs of [1, 2, 4]) {
      for (const lcd of [true, false]) {
        it(`matches the reference (vs ${vs}, ${lcd ? 'ClearType' : 'grayscale'})`, function () {
          const width = 37
          const rows = 9
          const tall = randomStrip(width, rows, vs, vs * 10 + (lcd ? 1 : 0))
          const expected = referenceStrip(tall, width, rows, vs, lcd)
          const actual = processStrip(tall.slice(), width, rows, vs, lcd)
          expect(Array.from(actual)).to.deep.equal(Array.from(expected))
        })

        it(`reads BGRA pixels with an unused fourth byte (vs ${vs}, ${lcd ? 'ClearType' : 'grayscale'})`, function () {
          const width = 37
          const rows = 9
          const tall = randomStrip(width, rows, vs, vs * 10 + (lcd ? 1 : 0))
          const expected = referenceStrip(tall, width, rows, vs, lcd)
          const bgrx = tall.slice()
          for (let i = 0; i < bgrx.length; i += 4) {
            bgrx[i] = tall[i + 2]
            bgrx[i + 2] = tall[i]
            bgrx[i + 3] = 0
          }
          const actual = processStrip(bgrx, width, rows, vs, lcd, true)
          expect(Array.from(actual)).to.deep.equal(Array.from(expected))
        })
      }
    }
  })

  describe('snapGlyphOrigins', function () {
    function fakeContext() {
      let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
      const stack: (typeof m)[] = []
      const ctx: any = {
        save() {
          stack.push({ ...m })
        },
        restore() {
          m = stack.pop()!
        },
        translate(x: number, y: number) {
          m = { ...m, e: m.e + m.a * x, f: m.f + m.d * y }
        },
        transform() {},
        scale(x: number, y: number) {
          m = { ...m, a: m.a * x, d: m.d * y }
        },
        rotate() {},
        fill() {},
        stroke() {},
        clip() {},
        drawImage() {},
        fillRect() {},
        beginPath() {},
        getTransform() {
          return { ...m }
        },
        setTransform(
          a: number,
          b: number,
          c: number,
          d: number,
          e: number,
          f: number
        ) {
          m = { a, b, c, d, e, f }
        },
        rotateTo(b: number) {
          m = { ...m, b, c: -b }
        },
      }
      return ctx
    }

    it('places glyphs drawn by pdf.js 5 (save, translate, scale, fill)', function () {
      const ctx = fakeContext()
      snapGlyphOrigins(ctx, 1, 4)
      ctx.save()
      ctx.translate(10.7, 21.9)
      ctx.scale(12, -12)
      const m = ctx.getTransform()
      // x floored to the subpixel grid, y rounded to the pixel grid (4 rows)
      expect(m.e).to.equal(10)
      expect(m.f).to.equal(20)
      expect(m.a).to.equal(12)
      expect(m.d).to.equal(-12)
    })

    it('places glyphs drawn by older pdf.js (save, translate, beginPath)', function () {
      const ctx = fakeContext()
      snapGlyphOrigins(ctx, 1, 4)
      ctx.save()
      ctx.translate(10.7, 21.9)
      ctx.beginPath()
      const m = ctx.getTransform()
      expect(m.e).to.equal(10)
      expect(m.f).to.equal(20)
    })

    it('leaves other drawing alone', function () {
      const ctx = fakeContext()
      snapGlyphOrigins(ctx, 1, 4)
      ctx.save()
      ctx.transform()
      ctx.translate(10.7, 21.9)
      ctx.beginPath()
      expect(ctx.getTransform().e).to.be.closeTo(10.7, 1e-9)
    })

    it('leaves rotated text alone', function () {
      const ctx = fakeContext()
      snapGlyphOrigins(ctx, 1, 4)
      ctx.rotateTo(1)
      ctx.save()
      ctx.translate(10.7, 21.9)
      ctx.beginPath()
      expect(ctx.getTransform().e).to.be.closeTo(10.7, 1e-9)
    })

    describe('CrispCanvasFactory', function () {
      // pdf.js asks the factory for its canvases; a document that makes
      // canvases with fake contexts
      function factory() {
        const ownerDocument: any = {
          createElement: () => {
            const ctx = fakeContext()
            const canvas = { width: 0, height: 0, getContext: () => ctx }
            ctx.canvas = canvas
            return canvas
          },
        }
        return new CrispCanvasFactory({ ownerDocument })
      }

      function drawGlyph(ctx: any) {
        ctx.save()
        ctx.translate(10.7, 21.9)
        ctx.scale(12, -12)
        return ctx.getTransform()
      }

      it('places glyphs on a canvas the size of a crisp work canvas', function () {
        const done = drawingCrispText(300, 400, 4)
        try {
          const { canvas, context } = factory().create(300, 400)
          expect(canvas?.width).to.equal(300)
          const m = drawGlyph(context)
          expect(m.e).to.equal(10)
          expect(m.f).to.equal(20)
        } finally {
          done()
        }
      })

      it('leaves other canvases alone', function () {
        const done = drawingCrispText(300, 400, 4)
        try {
          const { context } = factory().create(300, 200)
          expect(drawGlyph(context).e).to.be.closeTo(10.7, 1e-9)
        } finally {
          done()
        }
        // the crisp render has finished
        const { context } = factory().create(300, 400)
        expect(drawGlyph(context).e).to.be.closeTo(10.7, 1e-9)
      })

      it('frees canvases as pdf.js expects', function () {
        const made = factory().create(300, 400)
        factory().destroy(made)
        expect(made.canvas).to.equal(null)
        expect(made.context).to.equal(null)
      })
    })
  })
})

import { expect } from 'chai'

import {
  TEXT_GAMMA,
  averageRows,
  defaultTextRendering,
  downsample3x,
  isPdfTextRendering,
  snapGlyphOrigins,
} from '../../../../../frontend/js/features/pdf-preview/util/crisp-text'

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
  })
})

// Crisp PDF text rendering, matching the "crisp PDF text" mode of the
// LightView viewer (PDFium).
//
// LaTeX fonts (Type 1/CFF) are not hinted. Chromium fills small glyph paths
// with coarse anti-aliasing (4 sub-scanlines per pixel row), so thin strokes
// fade and faint bumps appear above letters. Here each page is drawn on a
// work canvas 3x wider and 4x taller; rows are averaged, and the horizontal
// samples are either spread over the R, G, B subpixels with FreeType's LCD
// filter (ClearType) or averaged (grayscale). Glyph origins are placed as
// PDFium does: vertically on whole pixels, horizontally on 1/3 pixel. Then
// PDFium's kTextGammaAdjust table (denser text) and a 1.4 gamma are applied.
//
// Rendering is intercepted by wrapping PDFPageProxy.render, which PDFViewer
// calls for every page and for zoomed-in page detail views.

import type { PDFPageProxy, RenderTask } from 'pdfjs-dist/types/src/display/api'

export type PdfTextRendering = 'standard' | 'crisp' | 'crisp-cleartype'

export const PDF_TEXT_RENDERING_MODES: PdfTextRendering[] = [
  'standard',
  'crisp',
  'crisp-cleartype',
]

/**
 * Default mode: ClearType only on Windows at normal pixel density (on
 * Retina displays, phones and screens with another subpixel order it
 * produces colour fringes); crisp, denser glyphs everywhere else.
 */
export function defaultTextRendering(
  platform: string = navigator.userAgent,
  devicePixelRatio: number = window.devicePixelRatio || 1
): PdfTextRendering {
  return /Windows/i.test(platform) && devicePixelRatio < 2
    ? 'crisp-cleartype'
    : 'crisp'
}

export function isPdfTextRendering(value: unknown): value is PdfTextRendering {
  return PDF_TEXT_RENDERING_MODES.includes(value as PdfTextRendering)
}

let currentMode: PdfTextRendering = 'standard'

export function setTextRenderingMode(mode: PdfTextRendering) {
  currentMode = mode
}

export function getTextRenderingMode(): PdfTextRendering {
  return currentMode
}

// ---------- pixel processing ----------

const WHITE = 0xffffffff

// kTextGammaAdjust from PDFium (core/fxge/cfx_renderdevice.cpp): boosts weak
// glyph coverage so that thin strokes stay visible
const PDFIUM_TEXT_GAMMA = [
  0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25,
  26, 27, 29, 30, 31, 32, 33, 34, 35, 36, 38, 39, 40, 41, 42, 43, 44, 45, 46,
  47, 48, 49, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66,
  67, 68, 69, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86,
  87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104,
  105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119,
  120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 129, 130, 131, 132, 133,
  134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148,
  149, 150, 151, 152, 153, 154, 155, 156, 156, 157, 158, 159, 160, 161, 162,
  163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 174, 175, 176,
  177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 190,
  191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 204,
  205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 217, 218,
  219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 228, 229, 230, 231, 232,
  233, 234, 235, 236, 237, 238, 239, 239, 240, 241, 242, 243, 244, 245, 246,
  247, 248, 249, 250, 250, 251, 252, 253, 254, 255,
]

/** smoothed brightness -> final brightness: PDFium table + 1.4 gamma */
export const TEXT_GAMMA = (() => {
  const lut = new Uint8Array(256)
  for (let v = 0; v < 256; v++) {
    const adjusted = 255 - PDFIUM_TEXT_GAMMA[255 - v]
    lut[v] = Math.round(255 * Math.pow(adjusted / 255, 1.4))
  }
  return lut
})()

/** FreeType's default LCD filter (FT_LCD_FILTER_DEFAULT) */
const LCD_FIR = [8, 77, 86, 77, 8]

/** average every `vs` rows (RGBA, `rowWords` pixels wide) into one row */
export function averageRows(
  tall: Uint8ClampedArray,
  rowWords: number,
  height: number,
  vs: number
): Uint8ClampedArray {
  const tall32 = new Uint32Array(tall.buffer, tall.byteOffset, tall.length >> 2)
  const out = new Uint8ClampedArray(rowWords * 4 * height)
  const out32 = new Uint32Array(out.buffer)
  const half = vs >> 1
  for (let y = 0; y < height; y++) {
    const t0 = y * vs * rowWords
    const o0 = y * rowWords
    for (let i = 0; i < rowWords; i++) {
      let white = true
      for (let k = 0; k < vs; k++) {
        if (tall32[t0 + k * rowWords + i] !== WHITE) {
          white = false
          break
        }
      }
      if (white) {
        out32[o0 + i] = WHITE
        continue
      }
      for (let c = 0; c < 3; c++) {
        let acc = 0
        for (let k = 0; k < vs; k++)
          acc += tall[(t0 + k * rowWords + i) * 4 + c]
        // integer division: assigning a fraction to Uint8ClampedArray would
        // round a second time (half to even)
        out[(o0 + i) * 4 + c] = ((acc + half) / vs) | 0
      }
      out[(o0 + i) * 4 + 3] = 255
    }
  }
  return out
}

/**
 * Reduce rows of triple width to `width` pixels (RGBA). With `lcd` the
 * samples are spread over the R, G, B subpixels with FreeType's LCD filter,
 * otherwise the three samples are averaged (grayscale). TEXT_GAMMA is
 * applied to the result.
 */
export function downsample3x(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  lcd: boolean
) {
  const src32 = new Uint32Array(src.buffer, src.byteOffset, src.length >> 2)
  const dst32 = new Uint32Array(dst.buffer, dst.byteOffset, dst.length >> 2)
  const w3 = width * 3
  for (let y = 0; y < height; y++) {
    const row = y * w3
    const rowEnd = row + w3 - 1
    for (let x = 0; x < width; x++) {
      const s = row + 3 * x
      const o = y * width + x
      const lo = s - 2 < row ? row : s - 2
      const hi = s + 4 > rowEnd ? rowEnd : s + 4
      let white = true
      for (let t = lo; t <= hi; t++) {
        if (src32[t] !== WHITE) {
          white = false
          break
        }
      }
      if (white) {
        dst32[o] = WHITE
        continue
      }
      if (lcd) {
        // subpixel c: sample s+c of the same channel and two neighbours on
        // each side
        for (let c = 0; c < 3; c++) {
          let acc = 0
          for (let k = -2; k <= 2; k++) {
            let t = s + c + k
            if (t < row) t = row
            else if (t > rowEnd) t = rowEnd
            acc += LCD_FIR[k + 2] * src[t * 4 + c]
          }
          dst[o * 4 + c] = TEXT_GAMMA[(acc + 128) >> 8]
        }
      } else {
        for (let c = 0; c < 3; c++) {
          const sum =
            src[s * 4 + c] + src[(s + 1) * 4 + c] + src[(s + 2) * 4 + c]
          dst[o * 4 + c] = TEXT_GAMMA[Math.round(sum / 3)]
        }
      }
      dst[o * 4 + 3] = 255
    }
  }
}

function applyGamma(data: Uint8ClampedArray) {
  const words = new Uint32Array(data.buffer, data.byteOffset, data.length >> 2)
  for (let i = 0; i < words.length; i++) {
    if (words[i] === WHITE) continue
    const o = i * 4
    data[o] = TEXT_GAMMA[data[o]]
    data[o + 1] = TEXT_GAMMA[data[o + 1]]
    data[o + 2] = TEXT_GAMMA[data[o + 2]]
  }
}

// ---------- glyph placement ----------

/**
 * Place glyph origins as PDFium does: vertically rounded to the pixel grid,
 * horizontally floored to the subpixel (or pixel) grid. pdf.js draws a glyph
 * path right after save -> translate(x, y): pdf.js 5 continues with
 * scale(size, -size) -> fill(path), older versions with beginPath. The
 * sequence is caught here on our own context; save -> translate is not used
 * anywhere else. `stepX`/`stepY` are the grid steps in canvas units. Rotated
 * text is left alone.
 */
export function snapGlyphOrigins(
  ctx: CanvasRenderingContext2D,
  stepX: number,
  stepY: number
) {
  const anyCtx = ctx as any
  const save = ctx.save
  const translate = ctx.translate
  const scale = ctx.scale
  const beginPath = ctx.beginPath
  let state = 0 // 1: right after save, 2: after save + translate
  const snapOrigin = (c: CanvasRenderingContext2D) => {
    const m = c.getTransform()
    if (m.b === 0 && m.c === 0) {
      c.setTransform(
        m.a,
        0,
        0,
        m.d,
        Math.floor(m.e / stepX) * stepX,
        Math.round(m.f / stepY) * stepY
      )
    }
  }
  anyCtx.save = function () {
    state = 1
    return save.call(this)
  }
  anyCtx.translate = function (x: number, y: number) {
    state = state === 1 ? 2 : 0
    return translate.call(this, x, y)
  }
  anyCtx.scale = function (
    this: CanvasRenderingContext2D,
    x: number,
    y: number
  ) {
    if (state === 2) snapOrigin(this)
    state = 0
    return scale.call(this, x, y)
  }
  anyCtx.beginPath = function (this: CanvasRenderingContext2D) {
    if (state === 2) snapOrigin(this)
    state = 0
    return beginPath.call(this)
  }
  // any other call between save and translate means this is not a glyph
  for (const name of [
    'transform',
    'setTransform',
    'rotate',
    'restore',
    'fill',
    'stroke',
    'clip',
    'drawImage',
    'fillRect',
  ]) {
    const orig = anyCtx[name]
    anyCtx[name] = function (...args: unknown[]) {
      state = 0
      return orig.apply(this, args)
    }
  }
}

// ---------- page rendering interception ----------

/** maximum work canvas area (pixels) */
const MAX_WORK_PIXELS = 24e6

type RenderParameters = Parameters<PDFPageProxy['render']>[0]

/** RenderTask with post-processing; exposes what PDFViewer uses */
class CrispRenderTask {
  // eslint-disable-next-line no-useless-constructor
  constructor(
    private readonly inner: RenderTask,
    readonly promise: Promise<void>
  ) {}

  get onContinue() {
    return this.inner.onContinue
  }

  set onContinue(fn) {
    this.inner.onContinue = fn
  }

  get onError() {
    return (this.inner as any).onError
  }

  set onError(fn) {
    ;(this.inner as any).onError = fn
  }

  get separateAnnots() {
    return this.inner.separateAnnots
  }

  cancel(extraDelay = 0) {
    this.inner.cancel(extraDelay)
  }
}

function crispRender(
  originalRender: PDFPageProxy['render'],
  page: PDFPageProxy,
  params: RenderParameters
): RenderTask {
  const mode = currentMode
  const target = params.canvasContext as CanvasRenderingContext2D | undefined
  const t = (params.transform as number[] | null | undefined) || [
    1, 0, 0, 1, 0, 0,
  ]
  if (
    mode === 'standard' ||
    !target ||
    (params as any).intent === 'print' ||
    params.pageColors ||
    t[1] !== 0 ||
    t[2] !== 0
  ) {
    return originalRender.call(page, params)
  }

  const W = target.canvas.width
  const H = target.canvas.height
  const lcd = mode === 'crisp-cleartype'

  // very large canvas (high zoom): glyphs are big anyway, placement and
  // gamma are enough
  if (W * 3 * H > MAX_WORK_PIXELS) {
    snapGlyphOrigins(target, 1, 1)
    const inner = originalRender.call(page, params)
    const promise = inner.promise.then(() => {
      const img = target.getImageData(0, 0, W, H)
      applyGamma(img.data)
      target.putImageData(img, 0, 0)
    })
    return new CrispRenderTask(inner, promise) as unknown as RenderTask
  }

  let vs = 4
  while (vs > 1 && W * 3 * H * vs > MAX_WORK_PIXELS) vs >>= 1
  const work = document.createElement('canvas')
  work.width = W * 3
  work.height = H * vs
  const wctx = work.getContext('2d', {
    alpha: false,
    willReadFrequently: true,
  }) as CanvasRenderingContext2D
  snapGlyphOrigins(wctx, 1, vs)
  const inner = originalRender.call(page, {
    ...params,
    canvasContext: wctx,
    transform: [3 * t[0], 0, 0, vs * t[3], 3 * t[4], vs * t[5]],
  })
  const promise = inner.promise.then(() => {
    const tall = wctx.getImageData(0, 0, work.width, work.height).data
    const src = vs > 1 ? averageRows(tall, work.width, H, vs) : tall
    const img = target.createImageData(W, H)
    downsample3x(src, img.data, W, H, lcd)
    target.putImageData(img, 0, 0)
    work.width = work.height = 0 // release the memory right away
  })
  return new CrispRenderTask(inner, promise) as unknown as RenderTask
}

const patchedPrototypes = new WeakSet<object>()

/**
 * Intercept page rendering (once per page class: PDFPageProxy is not
 * exported, so its prototype is taken from a page instance).
 */
export function installCrispRender(page: PDFPageProxy) {
  const proto = Object.getPrototypeOf(page)
  if (!proto || patchedPrototypes.has(proto)) return
  patchedPrototypes.add(proto)
  const originalRender: PDFPageProxy['render'] = proto.render
  proto.render = function (this: PDFPageProxy, params: RenderParameters) {
    return crispRender(originalRender, this, params)
  }
}

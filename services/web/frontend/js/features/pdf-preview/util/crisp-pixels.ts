// Pixel processing for crisp PDF text (see crisp-text.ts). Pure functions:
// used on the main thread and in crisp-pixels.worker.ts.

export const WHITE = 0xffffffff

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

function allWhite(words: Uint32Array, start: number, end: number) {
  for (let i = start; i < end; i++) {
    if (words[i] !== WHITE) return false
  }
  return true
}

// Rows are averaged on whole pixels: two 8-bit channels of a pixel, spread
// into the 16-bit lanes of a 32-bit word, are summed at once (sums of up to
// 4 bytes fit). Pixels are read as signed words, which V8 keeps in machine
// registers; white is then -1.
const LANES = 0x00ff00ff
const WHITE_WORD = -1

/** rounded averages of the pixels of rows `a`..`a + 3 * rowWords` */
function average4(
  words: Int32Array,
  a: number,
  rowWords: number,
  out: Int32Array,
  o: number
) {
  const b = a + rowWords
  const c = b + rowWords
  const d = c + rowWords
  for (let i = 0; i < rowWords; i++) {
    const p = words[a + i]
    const q = words[b + i]
    const r = words[c + i]
    const s = words[d + i]
    if ((p & q & r & s) === WHITE_WORD) {
      out[o + i] = WHITE_WORD
      continue
    }
    const lo =
      (p & LANES) + (q & LANES) + (r & LANES) + (s & LANES) + 0x00020002
    const hi =
      ((p >>> 8) & LANES) +
      ((q >>> 8) & LANES) +
      ((r >>> 8) & LANES) +
      ((s >>> 8) & LANES) +
      0x00020002
    out[o + i] = ((lo >>> 2) & LANES) | (((hi >>> 2) & LANES) << 8)
  }
}

/** rounded averages of the pixels of rows `a` and `a + rowWords` */
function average2(
  words: Int32Array,
  a: number,
  rowWords: number,
  out: Int32Array,
  o: number
) {
  const b = a + rowWords
  for (let i = 0; i < rowWords; i++) {
    const p = words[a + i]
    const q = words[b + i]
    if ((p & q) === WHITE_WORD) {
      out[o + i] = WHITE_WORD
      continue
    }
    const lo = (p & LANES) + (q & LANES) + 0x00010001
    const hi = ((p >>> 8) & LANES) + ((q >>> 8) & LANES) + 0x00010001
    out[o + i] = ((lo >>> 1) & LANES) | (((hi >>> 1) & LANES) << 8)
  }
}

/**
 * Average every `vs` rows (RGBA, `rowWords` pixels wide) into one row:
 * the rounded average (sum + vs/2) / vs of every channel. `vs` is 1, 2 or 4.
 * Groups of rows that are entirely white (space between lines of text) and
 * white columns are skipped.
 */
export function averageRows(
  tall: Uint8ClampedArray,
  rowWords: number,
  height: number,
  vs: number,
  out = new Uint8ClampedArray(rowWords * 4 * height)
): Uint8ClampedArray {
  const tall32 = new Uint32Array(tall.buffer, tall.byteOffset, tall.length >> 2)
  const words = new Int32Array(tall.buffer, tall.byteOffset, tall.length >> 2)
  const out32 = new Int32Array(out.buffer, out.byteOffset, out.length >> 2)
  if (vs === 1) {
    out32.set(words.subarray(0, rowWords * height))
    return out
  }
  for (let y = 0; y < height; y++) {
    const t0 = y * vs * rowWords
    const o0 = y * rowWords
    if (allWhite(tall32, t0, t0 + vs * rowWords)) {
      out32.fill(WHITE_WORD, o0, o0 + rowWords)
    } else if (vs === 4) {
      average4(words, t0, rowWords, out32, o0)
    } else {
      average2(words, t0, rowWords, out32, o0)
    }
  }
  return out
}

/** FreeType's LCD filter centred on byte `p` (same channel 4 bytes apart) */
function lcdTap(src: Uint8ClampedArray, p: number) {
  return (
    (86 * src[p] +
      77 * (src[p - 4] + src[p + 4]) +
      8 * (src[p - 8] + src[p + 8]) +
      128) >>
    8
  )
}

/**
 * Reduce rows of triple width to `width` pixels (RGBA). With `lcd` the
 * samples are spread over the R, G, B subpixels with FreeType's LCD filter,
 * otherwise the three samples are averaged (grayscale). TEXT_GAMMA is
 * applied to the result. The source is RGBA, or BGRA with `bgr`; the result
 * is always RGBA.
 */
export function downsample3x(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  lcd: boolean,
  bgr = false
) {
  const src32 = new Uint32Array(src.buffer, src.byteOffset, src.length >> 2)
  const dst32 = new Uint32Array(dst.buffer, dst.byteOffset, dst.length >> 2)
  const w3 = width * 3
  // byte offsets of the red and blue channels in a source pixel
  const red = bgr ? 2 : 0
  const blue = 2 - red
  for (let y = 0; y < height; y++) {
    const row = y * w3
    const rowEnd = row + w3 - 1
    if (allWhite(src32, row, row + w3)) {
      dst32.fill(WHITE, y * width, (y + 1) * width)
      continue
    }
    for (let x = 0; x < width; x++) {
      const s = row + 3 * x
      const o = y * width + x
      const edge = x === 0 || x === width - 1
      // white with all the filter's neighbours: nothing to compute
      if (
        !edge &&
        src32[s - 2] === WHITE &&
        src32[s - 1] === WHITE &&
        src32[s] === WHITE &&
        src32[s + 1] === WHITE &&
        src32[s + 2] === WHITE &&
        src32[s + 3] === WHITE &&
        src32[s + 4] === WHITE
      ) {
        dst32[o] = WHITE
        continue
      }
      const d = o * 4
      if (!lcd) {
        const p = s * 4
        const r = p + red
        const b = p + blue
        dst[d] = TEXT_GAMMA[Math.round((src[r] + src[r + 4] + src[r + 8]) / 3)]
        dst[d + 1] =
          TEXT_GAMMA[Math.round((src[p + 1] + src[p + 5] + src[p + 9]) / 3)]
        dst[d + 2] =
          TEXT_GAMMA[Math.round((src[b] + src[b + 4] + src[b + 8]) / 3)]
      } else if (edge) {
        // subpixel c: sample s+c of the same channel and two neighbours on
        // each side, clamped to the row
        for (let c = 0; c < 3; c++) {
          const channel = c === 1 ? 1 : c === 0 ? red : blue
          let acc = 0
          for (let k = -2; k <= 2; k++) {
            let t = s + c + k
            if (t < row) t = row
            else if (t > rowEnd) t = rowEnd
            acc += LCD_FIR[k + 2] * src[t * 4 + channel]
          }
          dst[d + c] = TEXT_GAMMA[(acc + 128) >> 8]
        }
      } else {
        // the same filter, unrolled: subpixel c is centred on sample s+c
        const p = s * 4
        dst[d] = TEXT_GAMMA[lcdTap(src, p + red)]
        dst[d + 1] = TEXT_GAMMA[lcdTap(src, p + 5)]
        dst[d + 2] = TEXT_GAMMA[lcdTap(src, p + 8 + blue)]
      }
      dst[d + 3] = 255
    }
  }
}

export function applyGamma(data: Uint8ClampedArray) {
  const words = new Uint32Array(data.buffer, data.byteOffset, data.length >> 2)
  for (let i = 0; i < words.length; i++) {
    if (words[i] === WHITE) continue
    const o = i * 4
    data[o] = TEXT_GAMMA[data[o]]
    data[o + 1] = TEXT_GAMMA[data[o + 1]]
    data[o + 2] = TEXT_GAMMA[data[o + 2]]
  }
}

// averaged rows of the strip being processed, reused: allocating fresh
// memory for every strip costs more than the averaging
let averaged = new Uint8ClampedArray(0)

/**
 * a strip of the work canvas (RGBA, or BGRA with `bgr`) processed into page
 * pixels (RGBA)
 */
export function processStrip(
  tall: Uint8ClampedArray,
  width: number,
  rows: number,
  vs: number,
  lcd: boolean,
  bgr = false
) {
  let src = tall
  if (vs > 1) {
    const bytes = width * 3 * rows * 4
    if (averaged.length < bytes) averaged = new Uint8ClampedArray(bytes)
    src = averageRows(tall, width * 3, rows, vs, averaged.subarray(0, bytes))
  }
  const out = new Uint8ClampedArray(width * rows * 4)
  downsample3x(src, out, width, rows, lcd, bgr)
  return out
}

// messages between crisp-text.ts and crisp-pixels.worker.ts

/** a rendered work canvas (width*3 x height*vs) to turn into page pixels */
export type CrispPageRequest = {
  type: 'page'
  id: number
  bitmap: ImageBitmap
  width: number
  height: number
  vs: number
  lcd: boolean
}

/** drop queued pages (a new document was loaded) */
export type CrispClearRequest = { type: 'clear' }

/** a queued page is on screen again: process it next */
export type CrispPromoteRequest = { type: 'promote'; id: number }

export type CrispWorkerRequest =
  | CrispPageRequest
  | CrispClearRequest
  | CrispPromoteRequest

export type CrispWorkerResponse =
  | { type: 'ready' }
  | { type: 'strip'; id: number; y: number; rows: number; out: ArrayBuffer }
  // the finished page, null if it failed or was dropped (and the worker's
  // time in ms: copying the work canvas, reading its pixels, the maths),
  // then its lossless PNG for the kept-pages cache
  | {
      type: 'done'
      id: number
      bitmap: ImageBitmap | null
      timing?: { copy: number; read: number; maths: number }
    }
  | { type: 'png'; id: number; png: Blob | null }

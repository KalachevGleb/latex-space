// Turns rendered crisp-text work canvases into page pixels off the main
// thread: reading the large work canvas and the pixel maths both happen
// here, so scrolling stays smooth while pages are being rendered.
//
// Every page sent here is finished, even if the viewer has meanwhile
// cancelled it (scrolled past): the result is kept by crisp-text.ts, so the
// page never has to be rendered again. The newest page is processed first —
// it is the one on screen.
import {
  CrispPageRequest,
  CrispWorkerRequest,
  CrispWorkerResponse,
  processStrip,
} from './crisp-pixels'

/** output rows sent back per message */
const STRIP_ROWS = 64

let pending: CrispPageRequest[] = []
let busy = false

function send(message: CrispWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer })
}

/** reads rows of the work canvas, RGBA or (with `bgr`) BGRA */
type WorkReader = {
  bgr: boolean
  fromFrame: boolean
  read(y: number, rows: number): Promise<Uint8ClampedArray>
  close(): void
}

// The work canvas is ~80 MB: every pass over freshly allocated memory of that
// size costs tens of milliseconds, so its rows are copied strip by strip
// into one reused buffer.
let stripBuffer = new Uint8ClampedArray(0)

function stripOf(bytes: number) {
  if (stripBuffer.length < bytes) stripBuffer = new Uint8ClampedArray(bytes)
  return stripBuffer.subarray(0, bytes)
}

// VideoFrame formats whose pixels are 4 bytes in this channel order (the
// fourth byte is alpha or unused), so they can be processed as they are
const FRAME_FORMATS: Record<string, { bgr: boolean }> = {
  RGBA: { bgr: false },
  RGBX: { bgr: false },
  BGRA: { bgr: true },
  BGRX: { bgr: true },
}

// false once copying from a VideoFrame failed: then canvases are used
let framesWork = typeof VideoFrame !== 'undefined'

/**
 * Copies rows straight from the bitmap's pixels in their own format: the
 * cheapest way there is (no canvas, no conversion to RGBA).
 */
function frameReader(bitmap: ImageBitmap): WorkReader | null {
  if (!framesWork) return null
  let frame: VideoFrame
  try {
    frame = new VideoFrame(bitmap, { timestamp: 0 })
  } catch {
    framesWork = false
    return null
  }
  const format = frame.format && FRAME_FORMATS[frame.format]
  if (!format) {
    frame.close()
    framesWork = false
    return null
  }
  const width = bitmap.width
  return {
    bgr: format.bgr,
    fromFrame: true,
    async read(y, rows) {
      const data = stripOf(width * rows * 4)
      await frame.copyTo(data, {
        rect: { x: 0, y, width, height: rows },
        layout: [{ offset: 0, stride: width * 4 }],
      })
      return data
    },
    close: () => frame.close(),
  }
}

/** the work canvas reused for canvasReader */
let spareCanvas: OffscreenCanvas | null = null

function canvasReader(bitmap: ImageBitmap): WorkReader {
  const { width, height } = bitmap
  if (spareCanvas?.width !== width || spareCanvas?.height !== height) {
    if (spareCanvas) spareCanvas.width = spareCanvas.height = 0
    spareCanvas = new OffscreenCanvas(width, height)
  }
  // opaque, like the work canvas: reading the pixels then needs no alpha
  // conversion
  const ctx = spareCanvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true,
  })
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(bitmap, 0, 0)
  return {
    bgr: false,
    fromFrame: false,
    read: async (y, rows) => ctx.getImageData(0, y, width, rows).data,
    close: () => {},
  }
}

async function processPage(request: CrispPageRequest) {
  const { id, bitmap, width, height, vs, lcd } = request
  let result: OffscreenCanvas | null = null
  const timing = { copy: 0, read: 0, maths: 0 }
  let reader: WorkReader | null = null
  // only a page processed to the end is sent back as finished
  let complete = false
  try {
    result = new OffscreenCanvas(width, height)
    // kept in main memory like PDFViewer's canvases: drawing the kept page
    // onto them then needs no read-back from the GPU
    const rctx = result.getContext('2d', {
      alpha: false,
      willReadFrequently: true,
    })
    if (!rctx) return
    let t = performance.now()
    reader = frameReader(bitmap) ?? canvasReader(bitmap)
    timing.copy = performance.now() - t
    for (let y = 0; y < height; y += STRIP_ROWS) {
      const rows = Math.min(STRIP_ROWS, height - y)
      t = performance.now()
      let tall: Uint8ClampedArray
      try {
        tall = await reader.read(y * vs, rows * vs)
      } catch (error) {
        if (!reader.fromFrame) throw error
        // copying from a VideoFrame is not supported here after all
        reader.close()
        framesWork = false
        reader = canvasReader(bitmap)
        tall = await reader.read(y * vs, rows * vs)
      }
      timing.read += performance.now() - t
      t = performance.now()
      const out = processStrip(tall, width, rows, vs, lcd, reader.bgr)
      rctx.putImageData(new ImageData(out, width, rows), 0, y)
      timing.maths += performance.now() - t
      send({ type: 'strip', id, y, rows, out: out.buffer as ArrayBuffer }, [
        out.buffer,
      ])
    }
    complete = true
  } finally {
    reader?.close()
    bitmap.close()
    if (result && complete) {
      // both take the pixels at call time. PNG rather than lossless WebP:
      // that is up to half the size, but takes three times longer to
      // encode, and scrolling got less smooth with it.
      const stored = result.convertToBlob({ type: 'image/png' })
      const finished = result.transferToImageBitmap()
      send({ type: 'done', id, bitmap: finished, timing }, [finished])
      // the next page waits for the compression: letting them overlap made
      // scrolling back less smooth
      send({ type: 'stored', id, blob: await stored.catch(() => null) })
    } else {
      send({ type: 'done', id, bitmap: null })
    }
  }
}

async function run() {
  if (busy) return
  busy = true
  try {
    // newest first: that is the page on screen
    let request = pending.pop()
    while (request) {
      // a failure is reported to the page (done without a bitmap); go on
      // with the others
      await processPage(request).catch(() => {})
      // let new requests in before choosing the next page
      await new Promise(resolve => setTimeout(resolve, 0))
      request = pending.pop()
    }
  } finally {
    busy = false
  }
}

self.addEventListener('message', (event: MessageEvent<CrispWorkerRequest>) => {
  const request = event.data
  if (request.type === 'clear') {
    for (const queued of pending) {
      queued.bitmap.close()
      send({ type: 'done', id: queued.id, bitmap: null })
    }
    pending = []
    return
  }
  if (request.type === 'promote') {
    const index = pending.findIndex(queued => queued.id === request.id)
    if (index >= 0) pending.push(...pending.splice(index, 1))
    return
  }
  pending.push(request)
  run()
})

send({ type: 'ready' })

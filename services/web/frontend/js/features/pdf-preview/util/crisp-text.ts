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
// PDFium's kTextGammaAdjust table (denser text) and a 1.4 gamma are applied
// (crisp-pixels.ts). The pixel work runs in a background worker when one is
// available, so that scrolling stays smooth.
//
// Rendering is intercepted by wrapping PDFPageProxy.render, which PDFViewer
// calls for every page and for zoomed-in page detail views.

import type { PDFPageProxy, RenderTask } from 'pdfjs-dist/types/src/display/api'
import {
  CrispPageRequest,
  CrispWorkerResponse,
  applyGamma,
  processStrip,
} from './crisp-pixels'

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
const snapSteps = new WeakMap<
  CanvasRenderingContext2D,
  { x: number; y: number }
>()

export function snapGlyphOrigins(
  ctx: CanvasRenderingContext2D,
  stepX: number,
  stepY: number
) {
  // a reused context keeps its wrappers; only the steps change
  const known = snapSteps.get(ctx)
  if (known) {
    known.x = stepX
    known.y = stepY
    return
  }
  const steps = { x: stepX, y: stepY }
  snapSteps.set(ctx, steps)
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
        Math.floor(m.e / steps.x) * steps.x,
        Math.round(m.f / steps.y) * steps.y
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

// ---------- incremental rasterisation ----------

// Chromium records canvas drawing and rasterises it only when the pixels
// are needed: for the large work canvas that is one long stall (50-130 ms)
// when the page is handed to the worker. Reading one pixel every few
// hundred drawing operations rasterises in small pieces instead, inside
// pdf.js' time-sliced rendering, which yields to the browser between
// slices.
const OPS_PER_RASTER = 256
const rasterising = new WeakSet<CanvasRenderingContext2D>()

function rasteriseIncrementally(ctx: CanvasRenderingContext2D) {
  if (rasterising.has(ctx)) return
  rasterising.add(ctx)
  const anyCtx = ctx as any
  const getImageData = ctx.getImageData
  let ops = 0
  for (const name of ['fill', 'stroke', 'fillRect', 'drawImage', 'fillText']) {
    const orig = anyCtx[name]
    anyCtx[name] = function (...args: unknown[]) {
      const result = orig.apply(this, args)
      if (++ops >= OPS_PER_RASTER) {
        ops = 0
        getImageData.call(this, 0, 0, 1, 1)
      }
      return result
    }
  }
}

// ---------- pages with blend modes ----------

// pdf.js draws a page that uses blend modes (other than Normal, anywhere in
// its resources) on a transparent canvas of the same size made by its canvas
// factory, and copies that onto the canvas it was given at the end. The
// hooks above must be on that canvas too, or glyphs on such pages are not
// placed on the pixel grid (with TikZ blend modes that is every page of a
// document: pgf shares its graphics states between pages).

/** sizes ("WxH") of canvases being drawn with crisp text -> vertical step */
const crispSizes = new Map<string, { vs: number; renders: number }>()

/**
 * A crisp render draws on a canvas of this size until the returned function
 * is called: canvases of the same size made by CrispCanvasFactory meanwhile
 * get the same hooks.
 */
export function drawingCrispText(width: number, height: number, vs: number) {
  const size = `${width}x${height}`
  const entry = crispSizes.get(size)
  if (entry) entry.renders++
  else crispSizes.set(size, { vs, renders: 1 })
  return () => {
    const current = crispSizes.get(size)
    if (current && --current.renders === 0) crispSizes.delete(size)
  }
}

function hookIfCrispSize(
  ctx: CanvasRenderingContext2D | null,
  width: number,
  height: number
) {
  const entry = crispSizes.get(`${width}x${height}`)
  if (!ctx || !entry) return
  snapGlyphOrigins(ctx, 1, entry.vs)
  rasteriseIncrementally(ctx)
}

type CanvasAndContext = {
  canvas: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
}

// Like the work canvas, a canvas of its size (the transparent canvas, or
// the layer of a soft mask) is as large as ~80 MB: one is kept for the next
// page, and freed when no page has needed it for a while. These stay canvas
// elements: pdf.js applies soft masks with SVG filters, which only work on
// canvases of a document.
const pageCanvases = new WeakSet<HTMLCanvasElement>()
let sparePageCanvas: HTMLCanvasElement | null = null
let spareTimer: ReturnType<typeof setTimeout> | undefined
// long enough not to free them during a pause for reading: allocating them
// again stalls the next page
const SPARE_KEPT_MS = 30000

function keepSparePageCanvas(canvas: HTMLCanvasElement) {
  sparePageCanvas = canvas
  clearTimeout(spareTimer)
  spareTimer = setTimeout(() => {
    if (sparePageCanvas === canvas) {
      sparePageCanvas = null
      canvas.width = canvas.height = 0
    }
  }, SPARE_KEPT_MS)
}

/**
 * pdf.js' canvas factory (DOMCanvasFactory, which is not exported) that also
 * hooks the transparent canvas of pages with blend modes; passed to
 * getDocument as `CanvasFactory`.
 */
export class CrispCanvasFactory {
  private readonly ownerDocument: Document
  private readonly enableHWA: boolean

  constructor({
    ownerDocument = globalThis.document,
    enableHWA = false,
  }: { ownerDocument?: Document; enableHWA?: boolean } = {}) {
    this.ownerDocument = ownerDocument
    this.enableHWA = enableHWA
  }

  create(width: number, height: number): CanvasAndContext {
    if (width <= 0 || height <= 0) {
      throw new Error('Invalid canvas size')
    }
    const canvas = crispSizes.has(`${width}x${height}`)
      ? this.pageCanvas(width, height)
      : this.newCanvas(width, height)
    const context = canvas.getContext('2d', {
      willReadFrequently: !this.enableHWA,
    })
    hookIfCrispSize(context, width, height)
    return { canvas, context }
  }

  reset(canvasAndContext: CanvasAndContext, width: number, height: number) {
    if (!canvasAndContext.canvas) {
      throw new Error('Canvas is not specified')
    }
    if (width <= 0 || height <= 0) {
      throw new Error('Invalid canvas size')
    }
    canvasAndContext.canvas.width = width
    canvasAndContext.canvas.height = height
    hookIfCrispSize(canvasAndContext.context, width, height)
  }

  destroy(canvasAndContext: CanvasAndContext) {
    const canvas = canvasAndContext.canvas
    if (!canvas) {
      throw new Error('Canvas is not specified')
    }
    if (!sparePageCanvas && pageCanvases.has(canvas)) {
      keepSparePageCanvas(canvas)
    } else {
      canvas.width = 0
      canvas.height = 0
    }
    canvasAndContext.canvas = null
    canvasAndContext.context = null
  }

  private newCanvas(width: number, height: number) {
    const canvas = this.ownerDocument.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }

  /** the kept canvas of the work canvas' size, cleared, or a new one */
  private pageCanvas(width: number, height: number) {
    const spare = sparePageCanvas
    sparePageCanvas = null
    if (spare && spare.width === width && spare.height === height) {
      const ctx = spare.getContext('2d', {
        willReadFrequently: !this.enableHWA,
      })
      // transparent, with the default state, as a new canvas
      if (ctx && typeof ctx.reset === 'function') {
        ctx.reset()
        return spare
      }
    }
    if (spare) spare.width = spare.height = 0
    const canvas = this.newCanvas(width, height)
    pageCanvases.add(canvas)
    return canvas
  }
}

// ---------- page rendering interception ----------

/** maximum work canvas area (pixels) */
const MAX_WORK_PIXELS = 24e6
/** output rows per strip when processing on the main thread */
const STRIP_ROWS = 16
/** main-thread time slice before yielding to the browser (ms) */
const SLICE_MS = 8

type RenderParameters = Parameters<PDFPageProxy['render']>[0]
type CancelledErrorClass = new (message: string, extraDelay?: number) => unknown

// replaced with pdf.js' RenderingCancelledException by installCrispRender:
// PDFViewer recognises cancelled rendering by this class
let CancelledError: CancelledErrorClass = class extends Error {}

/** counters for tests and diagnostics (times are main-thread milliseconds) */
export const crispStats = {
  rendered: 0,
  fromCache: 0,
  workRenderMs: 0,
  postProcessMs: 0,
  // time spent in the worker (its own thread)
  workerCopyMs: 0,
  workerReadMs: 0,
  workerMathsMs: 0,
}

function timed<T>(fn: () => T): T {
  const start = performance.now()
  try {
    return fn()
  } finally {
    crispStats.postProcessMs += performance.now() - start
  }
}

// ---------- finished pages ----------

// PDFViewer keeps only about 10 pages and draws evicted pages again when
// they scroll back into view, which takes far too long with this pipeline.
// Finished pages are kept here instead, within limits on memory: the most
// recently shown as ready bitmaps (drawn at once), the others as lossless
// PNG (a few hundred KB per page, decoded off the main thread in tens of
// milliseconds). Only beyond the limit for PNGs (documents of hundreds of
// pages) are the least recently shown pages dropped; they are drawn again
// if they come back. Zoomed-in detail views are not kept.
export const crispCacheLimits = {
  /**
   * pixels of ready bitmaps (4 bytes each): PDFViewer itself keeps the
   * canvases of the 10 most recent pages, so a few more are enough
   */
  bitmapPixels: 16e6,
  /**
   * bytes of PNGs: 1/32 of the device's memory where the browser tells it
   * (navigator.deviceMemory, in GB, at most 8), else 256 MB
   */
  storedBytes: storedBytesLimit(),
}

function storedBytesLimit() {
  const gb =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof gb === 'number' && gb > 0 ? (gb * 1e9) / 32 : 256e6
}
const MAX_CACHED_PAGE_PIXELS = 16e6

type CacheEntry = {
  bitmap: ImageBitmap | null
  /** the page compressed without loss */
  stored: Blob | null
  pixels: number
}
// Map iteration order is insertion order: the first entry is the oldest
const cache = new Map<string, CacheEntry>()
// pixels held in bitmaps, bytes held in compressed pages
let cachedPixels = 0
let storedBytes = 0
const pageIds = new WeakMap<PDFPageProxy, number>()
let nextPageId = 1

function cacheKey(
  page: PDFPageProxy,
  params: RenderParameters,
  t: number[],
  W: number,
  H: number,
  mode: PdfTextRendering
) {
  if (W * H > MAX_CACHED_PAGE_PIXELS || t[4] !== 0 || t[5] !== 0) {
    return null
  }
  let id = pageIds.get(page)
  if (!id) {
    id = nextPageId++
    pageIds.set(page, id)
  }
  const { scale, rotation, offsetX, offsetY } = params.viewport
  return [id, W, H, t[0], t[3], scale, rotation, offsetX, offsetY, mode].join()
}

function cacheGet(key: string) {
  const entry = cache.get(key)
  if (entry) {
    // most recently used goes to the end
    cache.delete(key)
    cache.set(key, entry)
  }
  return entry
}

function dropBitmap(entry: CacheEntry) {
  if (!entry.bitmap) return
  entry.bitmap.close()
  entry.bitmap = null
  cachedPixels -= entry.pixels
}

function removeEntry(key: string, entry: CacheEntry) {
  dropBitmap(entry)
  if (entry.stored) storedBytes -= entry.stored.size
  entry.stored = null
  cache.delete(key)
}

/**
 * keep within the limits: the oldest pages stay only compressed, the
 * oldest compressed pages are dropped (pages still being compressed keep
 * their bitmaps)
 */
function trimCache() {
  for (const entry of cache.values()) {
    if (cachedPixels <= crispCacheLimits.bitmapPixels) break
    if (entry.stored) dropBitmap(entry)
  }
  for (const [key, entry] of cache) {
    if (storedBytes <= crispCacheLimits.storedBytes) break
    if (entry.stored) removeEntry(key, entry)
  }
}

function setBitmap(entry: CacheEntry, bitmap: ImageBitmap) {
  dropBitmap(entry)
  entry.bitmap = bitmap
  entry.pixels = bitmap.width * bitmap.height
  cachedPixels += entry.pixels
  trimCache()
}

function setStored(entry: CacheEntry, blob: Blob) {
  if (entry.stored) storedBytes -= entry.stored.size
  entry.stored = blob
  storedBytes += blob.size
  trimCache()
}

function newEntry(): CacheEntry {
  return { bitmap: null, stored: null, pixels: 0 }
}

/** what the kept pages take now */
export function crispCacheUsage() {
  return { pages: cache.size, bitmapPixels: cachedPixels, storedBytes }
}

function cachePut(key: string, canvas: HTMLCanvasElement) {
  if (typeof createImageBitmap === 'undefined') return
  const old = cache.get(key)
  if (old) removeEntry(key, old)
  const entry = newEntry()
  cache.set(key, entry)
  // both copy the canvas at call time, before PDFViewer reuses it
  canvas.toBlob(blob => {
    if (blob && cache.get(key) === entry) setStored(entry, blob)
  }, 'image/png')
  createImageBitmap(canvas)
    .then(bitmap => {
      if (cache.get(key) === entry) setBitmap(entry, bitmap)
      else bitmap.close()
    })
    .catch(() => {})
}

/** an entry for a page finished in the worker, as the most recent */
function cacheEntryFor(key: string) {
  const entry = cache.get(key) ?? newEntry()
  cache.delete(key)
  cache.set(key, entry)
  return entry
}

// results that arrive after a new document was loaded are dropped
let cacheGeneration = 0
// pages being processed in the worker: key -> job id
const inWorker = new Map<string, number>()

/** drop all kept pages (a new document was loaded) */
export function clearCrispCache() {
  for (const entry of cache.values()) entry.bitmap?.close()
  cache.clear()
  cachedPixels = 0
  storedBytes = 0
  cacheGeneration++
  inWorker.clear()
  worker?.postMessage({ type: 'clear' })
}

// ---------- background worker ----------

// The work canvas is an OffscreenCanvas: after pdf.js has drawn the page,
// its pixels are handed to the worker without copying
// (transferToImageBitmap), and reading them back and all the pixel maths
// happen there. Until the worker has started, or where it is not
// available, pages are processed on the main thread.

let createWorker: (() => Worker) | null = null
// undefined: not created yet; null: not available
let worker: Worker | null | undefined
let workerReady = false
type PageJob = {
  key: string | null
  generation: number
  // the page is drawn by the task that started the job (unless cancelled)
  onStrip: (y: number, rows: number, out: Uint8ClampedArray) => void
  resolve: () => void
  reject: (error: unknown) => void
  // tasks for the same page waiting for this job (the page came back)
  waiters: (() => void)[]
}
const pageJobs = new Map<number, PageJob>()
let nextJobId = 1

function startWorker() {
  worker = null
  if (
    !createWorker ||
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined'
  ) {
    return
  }
  try {
    const w = createWorker()
    w.addEventListener(
      'message',
      (event: MessageEvent<CrispWorkerResponse>) => {
        const message = event.data
        if (message.type === 'ready') {
          workerReady = true
          return
        }
        const job = pageJobs.get(message.id)
        if (!job) return
        const current = job.generation === cacheGeneration
        if (message.type === 'strip') {
          job.onStrip(
            message.y,
            message.rows,
            new Uint8ClampedArray(message.out)
          )
        } else if (message.type === 'done') {
          if (message.timing) {
            crispStats.workerCopyMs += message.timing.copy
            crispStats.workerReadMs += message.timing.read
            crispStats.workerMathsMs += message.timing.maths
          }
          // keep the finished page even if its rendering was cancelled
          if (message.bitmap && job.key && current) {
            setBitmap(cacheEntryFor(job.key), message.bitmap)
          } else {
            message.bitmap?.close()
          }
          if (job.key && inWorker.get(job.key) === message.id) {
            inWorker.delete(job.key)
          }
          if (!job.key || !message.bitmap) pageJobs.delete(message.id)
          if (message.bitmap) job.resolve()
          else job.reject(new Error('crisp-pixels worker failed on a page'))
          for (const waiter of job.waiters) waiter()
        } else {
          // the compressed page comes last
          pageJobs.delete(message.id)
          const entry = job.key && current ? cache.get(job.key) : undefined
          if (entry && message.blob) setStored(entry, message.blob)
        }
      }
    )
    w.addEventListener('error', () => {
      // e.g. the worker script could not be loaded: use the main thread
      worker = null
      workerReady = false
      w.terminate()
      for (const job of pageJobs.values()) {
        job.reject(new Error('crisp-pixels worker failed'))
        for (const waiter of job.waiters) waiter()
      }
      pageJobs.clear()
      inWorker.clear()
    })
    worker = w
  } catch {
    worker = null
  }
}

/** the worker once it has started; null while starting or if unavailable */
function readyWorker() {
  if (worker === undefined) startWorker()
  return worker && workerReady ? worker : null
}

// ---------- incremental post-processing ----------

/** let the browser handle input and paint a frame */
function yieldToBrowser() {
  return new Promise<void>(resolve => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

/**
 * Process the page in strips of rows on the main thread, yielding to the
 * browser every few milliseconds: one pass over a whole page would block
 * scrolling. Finished strips appear on the page right away.
 */
async function processInStrips(
  task: CrispRenderTask,
  H: number,
  processRows: (y: number, rows: number) => void
) {
  let sliceStart = performance.now()
  for (let y = 0; y < H; y += STRIP_ROWS) {
    if (task.cancelled) {
      throw new CancelledError('Rendering cancelled')
    }
    timed(() => processRows(y, Math.min(STRIP_ROWS, H - y)))
    if (performance.now() - sliceStart > SLICE_MS) {
      await yieldToBrowser()
      sliceStart = performance.now()
    }
  }
}

/**
 * The same in the worker: the work canvas is handed over without copying,
 * finished strips come back and are written to the page.
 */
async function processInWorker(
  task: CrispRenderTask,
  w: Worker,
  key: string | null,
  work: OffscreenCanvas,
  target: CanvasRenderingContext2D,
  W: number,
  H: number,
  vs: number,
  lcd: boolean
) {
  const id = nextJobId++
  const done = new Promise<void>((resolve, reject) => {
    pageJobs.set(id, {
      key,
      generation: cacheGeneration,
      onStrip: (y, rows, out) => {
        if (!task.cancelled) {
          timed(() => target.putImageData(new ImageData(out, W, rows), 0, y))
        }
      },
      resolve,
      reject,
      waiters: [],
    })
  })
  done.catch(() => {}) // may fail after the task was cancelled
  if (key) inWorker.set(key, id)
  const request: CrispPageRequest = {
    type: 'page',
    id,
    bitmap: work.transferToImageBitmap(),
    width: W,
    height: H,
    vs,
    lcd,
  }
  w.postMessage(request, [request.bitmap])
  // a cancelled page is still finished in the worker and kept, but the
  // viewer is released at once
  const cancelled = new Promise<never>((resolve, reject) => {
    task.onCancel = () => reject(new CancelledError('Rendering cancelled'))
  })
  try {
    await Promise.race([done, cancelled])
  } finally {
    task.onCancel = null
  }
}

/**
 * The page is still being processed in the worker (its rendering was
 * cancelled when it left the screen): wait for that result instead of
 * rendering it again, and have the worker do it next.
 */
function waitForWorker(
  w: Worker,
  id: number,
  key: string,
  target: CanvasRenderingContext2D,
  renderAgain: () => RenderTask
): RenderTask {
  const job = pageJobs.get(id)
  const task = new CrispRenderTask(null, async task => {
    if (job) {
      w.postMessage({ type: 'promote', id })
      await new Promise<void>(resolve => {
        job.waiters.push(resolve)
        task.onCancel = resolve
      })
      task.onCancel = null
    }
    if (task.cancelled) {
      throw new CancelledError('Rendering cancelled')
    }
    const entry = cache.get(key)
    if (entry?.bitmap) {
      target.drawImage(entry.bitmap, 0, 0)
      return
    }
    // the worker failed: render the page after all
    const again = renderAgain()
    task.onCancel = () => again.cancel()
    await again.promise
  })
  return task as unknown as RenderTask
}

async function processWorkCanvas(
  task: CrispRenderTask,
  key: string | null,
  work: WorkCanvas,
  wctx: CanvasRenderingContext2D,
  target: CanvasRenderingContext2D,
  W: number,
  H: number,
  vs: number,
  lcd: boolean
) {
  const w = readyWorker()
  if (
    w &&
    typeof OffscreenCanvas !== 'undefined' &&
    work instanceof OffscreenCanvas
  ) {
    // the worker also keeps the finished page
    await processInWorker(task, w, key, work, target, W, H, vs, lcd)
    return
  }
  await processInStrips(task, H, (y, rows) => {
    const tall = wctx.getImageData(0, y * vs, W * 3, rows * vs).data
    const out = processStrip(tall, W, rows, vs, lcd)
    target.putImageData(new ImageData(out, W, rows), 0, y)
  })
  if (key) cachePut(key, target.canvas)
}

/** RenderTask with post-processing; exposes what PDFViewer uses */
class CrispRenderTask {
  cancelled = false
  /** stops work handed to the worker */
  onCancel: (() => void) | null = null
  readonly promise: Promise<void>

  constructor(
    private readonly inner: RenderTask | null,
    run: (task: CrispRenderTask) => Promise<void>
  ) {
    this.promise = run(this)
  }

  get onContinue() {
    return this.inner?.onContinue
  }

  set onContinue(fn: RenderTask['onContinue'] | undefined) {
    if (this.inner && fn) this.inner.onContinue = fn
  }

  get onError() {
    return (this.inner as any)?.onError
  }

  set onError(fn) {
    if (this.inner) (this.inner as any).onError = fn
  }

  get separateAnnots() {
    return this.inner?.separateAnnots ?? false
  }

  cancel(extraDelay = 0) {
    this.cancelled = true
    this.inner?.cancel(extraDelay)
    this.onCancel?.()
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

  // PDFViewer shows the (opaque) canvas while rendering is still going on;
  // until the result is written it would be black
  target.fillStyle = '#ffffff'
  target.fillRect(0, 0, W, H)

  // a page drawn before: show it at once (or after decoding it)
  const key = cacheKey(page, params, t, W, H, mode)
  const kept = key ? cacheGet(key) : undefined
  if (kept?.bitmap) {
    target.drawImage(kept.bitmap, 0, 0)
    crispStats.fromCache++
    return new CrispRenderTask(null, async () => {}) as unknown as RenderTask
  }
  if (key && kept?.stored) {
    const stored = kept.stored
    crispStats.fromCache++
    const task = new CrispRenderTask(null, async task => {
      const bitmap = await createImageBitmap(stored)
      if (task.cancelled) {
        bitmap.close()
        throw new CancelledError('Rendering cancelled')
      }
      target.drawImage(bitmap, 0, 0)
      if (cache.get(key) === kept) setBitmap(kept, bitmap)
      else bitmap.close()
    })
    return task as unknown as RenderTask
  }
  // still being processed in the worker after an earlier cancellation
  const jobId = key ? inWorker.get(key) : undefined
  if (key && jobId !== undefined && worker) {
    crispStats.fromCache++
    return waitForWorker(worker, jobId, key, target, () => {
      inWorker.delete(key)
      return crispRender(originalRender, page, params)
    })
  }
  crispStats.rendered++

  // very large canvas (high zoom): glyphs are big anyway, placement and
  // gamma are enough
  if (W * 3 * H > MAX_WORK_PIXELS) {
    snapGlyphOrigins(target, 1, 1)
    const drawn = drawingCrispText(W, H, 1)
    const inner = originalRender.call(page, params)
    const task = new CrispRenderTask(inner, async task => {
      try {
        await inner.promise
      } finally {
        drawn()
      }
      await processInStrips(task, H, (y, rows) => {
        const img = target.getImageData(0, y, W, rows)
        applyGamma(img.data)
        target.putImageData(img, 0, y)
      })
    })
    return task as unknown as RenderTask
  }

  let vs = 4
  while (vs > 1 && W * 3 * H * vs > MAX_WORK_PIXELS) vs >>= 1
  const work = acquireWorkCanvas(W * 3, H * vs)
  const wctx = workContext(work)
  snapGlyphOrigins(wctx, 1, vs)
  rasteriseIncrementally(wctx)
  const drawn = drawingCrispText(W * 3, H * vs, vs)
  const inner = originalRender.call(page, {
    ...params,
    canvasContext: wctx,
    transform: [3 * t[0], 0, 0, vs * t[3], 3 * t[4], vs * t[5]],
  })
  const renderStart = performance.now()
  const task = new CrispRenderTask(inner, async task => {
    try {
      try {
        await inner.promise
      } finally {
        drawn()
      }
      crispStats.workRenderMs += performance.now() - renderStart
      await processWorkCanvas(task, key, work, wctx, target, W, H, vs, lcd)
    } finally {
      releaseWorkCanvas(work)
    }
  })
  return task as unknown as RenderTask
}

// The work canvas (3x wider, 4x taller than the page, ~80 MB) is reused:
// allocating such a canvas for every page stalls scrolling. PDFViewer
// renders pages one after another, so one spare canvas is enough; a
// concurrent render gets a temporary one.
type WorkCanvas = HTMLCanvasElement | OffscreenCanvas
let spareWorkCanvas: WorkCanvas | null = null

function workContext(canvas: WorkCanvas) {
  return canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true,
  }) as CanvasRenderingContext2D
}

function acquireWorkCanvas(width: number, height: number): WorkCanvas {
  let canvas = spareWorkCanvas
  spareWorkCanvas = null
  if (canvas && canvas.width === width && canvas.height === height) {
    // same size: clear the pixels and the state left by the previous page
    const ctx = workContext(canvas)
    if (typeof ctx.reset === 'function') ctx.reset()
    else canvas.width = width
    return canvas
  }
  if (canvas) canvas.width = canvas.height = 0
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

let spareWorkTimer: ReturnType<typeof setTimeout> | undefined

function releaseWorkCanvas(canvas: WorkCanvas) {
  if (spareWorkCanvas) {
    canvas.width = canvas.height = 0
    return
  }
  spareWorkCanvas = canvas
  // freed when no page has been rendered for a while
  clearTimeout(spareWorkTimer)
  spareWorkTimer = setTimeout(() => {
    if (spareWorkCanvas === canvas) {
      spareWorkCanvas = null
      canvas.width = canvas.height = 0
    }
  }, SPARE_KEPT_MS)
}

const patchedPrototypes = new WeakSet<object>()

/**
 * Intercept page rendering (once per page class: PDFPageProxy is not
 * exported, so its prototype is taken from a page instance).
 * `renderingCancelledException` is pdf.js' class for cancelled rendering;
 * `createWorker` creates the worker for pixel processing (crisp-pixels.worker).
 */
export function installCrispRender(
  page: PDFPageProxy,
  options: {
    renderingCancelledException?: CancelledErrorClass
    createWorker?: () => Worker
  } = {}
) {
  if (options.renderingCancelledException) {
    CancelledError = options.renderingCancelledException
  }
  if (options.createWorker && !createWorker) {
    createWorker = options.createWorker
    // start now, so that it is ready by the time the first page is drawn
    startWorker()
  }
  const proto = Object.getPrototypeOf(page)
  if (!proto || patchedPrototypes.has(proto)) return
  patchedPrototypes.add(proto)
  const originalRender: PDFPageProxy['render'] = proto.render
  proto.render = function (this: PDFPageProxy, params: RenderParameters) {
    return crispRender(originalRender, this, params)
  }
}

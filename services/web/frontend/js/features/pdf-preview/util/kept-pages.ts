// Finished pages of crisp text rendering (crisp-text.ts), kept so that a page
// that comes back into view need not be drawn again, within limits on
// memory:
//
// - the most recently shown pages also as ready bitmaps, drawn at once
//   (least recently shown first out);
// - all pages as lossless PNG, decoded off the main thread in tens of
//   milliseconds. Beyond the limit for PNGs (documents of hundreds of pages)
//   pages are dropped, and drawn again if they come back: first those that
//   were shown long ago and are quick to draw again, so that pages with
//   heavy graphics, which take long to draw, are kept longer. This is
//   GreedyDual-Size: a page is worth the time when it was last shown plus
//   the time it takes to draw it per MB of its PNG; the page worth least is
//   dropped, and the time moves on to its worth. An expensive page thus
//   outlasts several cheap ones, but it ages too if it is not shown again.

/** an ImageBitmap (or a stand-in in tests) */
export type PageBitmap = {
  readonly width: number
  readonly height: number
  close(): void
}

/** a Blob with the PNG (or a stand-in in tests) */
export type StoredPage = { readonly size: number }

export type KeptPage<B extends PageBitmap, S extends StoredPage> = {
  bitmap: B | null
  stored: S | null
  /** how long the page took to draw (ms): what keeping it saves */
  renderMs: number
  /** the time (of KeptPages' clock) when the page was last shown */
  shownAt: number
}

export type KeptPagesLimits = {
  /** pixels of ready bitmaps (4 bytes each) */
  bitmapPixels: number
  /** bytes of PNGs */
  storedBytes: number
}

export class KeptPages<
  B extends PageBitmap = ImageBitmap,
  S extends StoredPage = Blob,
> {
  // iteration order is insertion order: the least recently shown first
  private readonly pages = new Map<string, KeptPage<B, S>>()
  private bitmapPixels = 0
  private storedBytes = 0
  // moves on to the worth of every dropped page
  private clock = 0
  private readonly limits: KeptPagesLimits

  constructor(limits: KeptPagesLimits) {
    this.limits = limits
  }

  /** the kept page, without counting it as shown */
  get(key: string) {
    return this.pages.get(key)
  }

  /** the kept page, now the most recently shown */
  show(key: string) {
    const page = this.pages.get(key)
    if (page) this.touch(key, page)
    return page
  }

  /**
   * the page that was just drawn (in `renderMs`), as the most recently
   * shown; its bitmap and PNG are added when they are ready
   */
  add(key: string, renderMs: number) {
    let page = this.pages.get(key)
    if (!page) {
      page = { bitmap: null, stored: null, renderMs, shownAt: this.clock }
    }
    page.renderMs = renderMs
    this.touch(key, page)
    return page
  }

  /** whether `page` is still the one kept for `key` */
  has(key: string, page: KeptPage<B, S>) {
    return this.pages.get(key) === page
  }

  setBitmap(page: KeptPage<B, S>, bitmap: B) {
    this.dropBitmap(page)
    page.bitmap = bitmap
    this.bitmapPixels += bitmap.width * bitmap.height
    this.trim()
  }

  setStored(page: KeptPage<B, S>, stored: S) {
    if (page.stored) this.storedBytes -= page.stored.size
    page.stored = stored
    this.storedBytes += stored.size
    this.trim()
  }

  delete(key: string) {
    const page = this.pages.get(key)
    if (!page) return
    this.dropBitmap(page)
    if (page.stored) this.storedBytes -= page.stored.size
    page.stored = null
    this.pages.delete(key)
  }

  clear() {
    for (const page of this.pages.values()) page.bitmap?.close()
    this.pages.clear()
    this.bitmapPixels = 0
    this.storedBytes = 0
    this.clock = 0
  }

  /** what the kept pages take now */
  usage() {
    return {
      pages: this.pages.size,
      bitmapPixels: this.bitmapPixels,
      storedBytes: this.storedBytes,
    }
  }

  private touch(key: string, page: KeptPage<B, S>) {
    this.pages.delete(key)
    this.pages.set(key, page)
    page.shownAt = this.clock
  }

  private dropBitmap(page: KeptPage<B, S>) {
    if (!page.bitmap) return
    this.bitmapPixels -= page.bitmap.width * page.bitmap.height
    page.bitmap.close()
    page.bitmap = null
  }

  /** what keeping the page is worth (only pages with a PNG are dropped) */
  private worth(page: KeptPage<B, S>, stored: S) {
    return page.shownAt + page.renderMs / Math.max(stored.size / 1e6, 0.01)
  }

  /** keep within the limits (pages still without a PNG keep their bitmaps) */
  private trim() {
    for (const page of this.pages.values()) {
      if (this.bitmapPixels <= this.limits.bitmapPixels) break
      if (page.stored) this.dropBitmap(page)
    }
    while (this.storedBytes > this.limits.storedBytes) {
      let cheapest: string | null = null
      let lowest = Infinity
      for (const [key, page] of this.pages) {
        if (!page.stored) continue
        const worth = this.worth(page, page.stored)
        // on a tie the least recently shown, which comes first
        if (worth < lowest) {
          lowest = worth
          cheapest = key
        }
      }
      if (cheapest === null) break
      this.clock = lowest
      this.delete(cheapest)
    }
  }
}

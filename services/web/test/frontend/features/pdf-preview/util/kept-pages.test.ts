import { expect } from 'chai'

import { KeptPages } from '../../../../../frontend/js/features/pdf-preview/util/kept-pages'

// stand-ins for ImageBitmap and Blob
class Bitmap {
  readonly width = 1000
  readonly height = 1000
  closed = false

  close() {
    this.closed = true
  }
}

const MB = 1e6
const png = (size = 1 * MB) => ({ size })

function store(limits: { bitmapPixels?: number; storedBytes?: number } = {}) {
  return new KeptPages<Bitmap, { size: number }>({
    bitmapPixels: limits.bitmapPixels ?? Infinity,
    storedBytes: limits.storedBytes ?? Infinity,
  })
}

/** a finished page with its bitmap and PNG */
function addPage(
  pages: ReturnType<typeof store>,
  key: string,
  renderMs: number,
  size = 1 * MB
) {
  const page = pages.add(key, renderMs)
  const bitmap = new Bitmap()
  pages.setBitmap(page, bitmap)
  pages.setStored(page, png(size))
  return { page, bitmap }
}

const keys = (pages: ReturnType<typeof store>, all: string[]) =>
  all.filter(key => pages.get(key))

describe('KeptPages', function () {
  it('keeps bitmaps of the most recently shown pages only', function () {
    // room for two bitmaps of 1000x1000
    const pages = store({ bitmapPixels: 2e6 })
    const a = addPage(pages, 'a', 100)
    const b = addPage(pages, 'b', 100)
    pages.show('a')
    const c = addPage(pages, 'c', 100)
    // b was shown least recently: only its PNG stays
    expect(b.bitmap.closed).to.equal(true)
    expect(b.page.bitmap).to.equal(null)
    expect(b.page.stored).to.not.equal(null)
    expect(a.page.bitmap).to.equal(a.bitmap)
    expect(c.page.bitmap).to.equal(c.bitmap)
    expect(pages.usage()).to.deep.equal({
      pages: 3,
      bitmapPixels: 2e6,
      storedBytes: 3 * MB,
    })
  })

  it('keeps the bitmap of a page whose PNG is not ready yet', function () {
    const pages = store({ bitmapPixels: 0 })
    const page = pages.add('a', 100)
    const bitmap = new Bitmap()
    pages.setBitmap(page, bitmap)
    expect(page.bitmap).to.equal(bitmap)
    pages.setStored(page, png())
    expect(page.bitmap).to.equal(null)
    expect(bitmap.closed).to.equal(true)
  })

  it('drops pages shown long ago and quick to draw first', function () {
    const pages = store({ storedBytes: 3 * MB })
    addPage(pages, 'slow', 1500)
    addPage(pages, 'quick1', 300)
    addPage(pages, 'quick2', 300)
    addPage(pages, 'quick3', 300)
    // over the limit: the oldest quick page goes, the slow one stays
    expect(keys(pages, ['slow', 'quick1', 'quick2', 'quick3'])).to.deep.equal([
      'slow',
      'quick2',
      'quick3',
    ])
    expect(pages.usage().storedBytes).to.equal(3 * MB)
  })

  it('keeps a slow page longer, but not for ever', function () {
    const pages = store({ storedBytes: 3 * MB })
    addPage(pages, 'slow', 1500)
    let outlasted = 0
    for (let i = 0; i < 100 && pages.get('slow'); i++) {
      addPage(pages, `quick${i}`, 300)
      if (pages.get('slow')) outlasted++
    }
    // the quick pages after it each last two more pages; the slow one
    // outlasts several of them, then ages
    expect(outlasted).to.be.greaterThan(4)
    expect(pages.get('slow')).to.equal(undefined)
  })

  it('counts a page as new again when it is shown', function () {
    const pages = store({ storedBytes: 3 * MB })
    addPage(pages, 'a', 300)
    addPage(pages, 'b', 300)
    addPage(pages, 'c', 300)
    pages.show('a')
    addPage(pages, 'd', 300)
    expect(keys(pages, ['a', 'b', 'c', 'd'])).to.deep.equal(['a', 'c', 'd'])
  })

  it('weighs the time to draw a page against the size of its PNG', function () {
    const pages = store({ storedBytes: 3 * MB })
    // equally slow, but one takes three times the memory: per MB the large
    // one is worth less than a page quicker to draw
    addPage(pages, 'large', 600, 1.5 * MB) // 400 ms per MB
    addPage(pages, 'small', 600, 0.5 * MB) // 1200
    addPage(pages, 'other', 500, 1 * MB) // 500
    addPage(pages, 'new', 300, 0.5 * MB) // 600
    expect(keys(pages, ['large', 'small', 'other', 'new'])).to.deep.equal([
      'small',
      'other',
      'new',
    ])
  })

  it('never drops pages whose PNG is not ready yet', function () {
    const pages = store({ storedBytes: 1 * MB })
    pages.add('pending', 100)
    addPage(pages, 'a', 1000)
    addPage(pages, 'b', 1000)
    expect(pages.get('pending')).to.not.equal(undefined)
  })

  it('frees everything on clear and delete', function () {
    const pages = store()
    const a = addPage(pages, 'a', 100)
    addPage(pages, 'b', 100)
    pages.delete('b')
    expect(pages.usage()).to.deep.equal({
      pages: 1,
      bitmapPixels: 1e6,
      storedBytes: 1 * MB,
    })
    pages.clear()
    expect(a.bitmap.closed).to.equal(true)
    expect(pages.usage()).to.deep.equal({
      pages: 0,
      bitmapPixels: 0,
      storedBytes: 0,
    })
  })
})

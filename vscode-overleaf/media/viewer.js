/* global pdfjsLib, acquireVsCodeApi */
(function () {
  'use strict'

  // pdf.worker.min.js подключён обычным <script> и работает на главном
  // потоке (globalThis.pdfjsWorker). Реальный Worker в webview VSCode
  // не создаём: его сетевые запросы идут мимо service worker'а и висят
  // до таймаута (~30 с) перед откатом на главный поток.
  const vscode = acquireVsCodeApi()

  const pagesEl = document.getElementById('pages')
  const statusEl = document.getElementById('status')
  const pageInfoEl = document.getElementById('page-info')
  const zoomLabel = document.getElementById('zoom-label')

  /** документ на экране */
  let pdfDoc = null
  /** загруженный документ, который ещё готовится к показу */
  let incomingDoc = null
  let loadTicket = 0
  let scale = 1.0
  let fitWidth = true
  let laying = false
  let pendingLayout = false
  let lastLayoutWidth = 0
  /** effScale последней раскладки — для пересчёта прокрутки при зуме */
  let prevScale = 0
  /** масштаб и dpr текущей раскладки — для страниц, загружаемых позже */
  let layoutScale = 1
  let layoutDpr = 1
  /** растёт с каждой раскладкой: работа для прежней раскладки отбрасывается */
  let generation = 0
  /**
   * {num, gen, wrap, page, viewport, pageWidthPt, pageHeightPt,
   *  cssWidth, cssHeight, pxWidth, pxHeight, canvas, layer, drawn, drawing}
   */
  const pageStates = []

  function setStatus(text) {
    statusEl.textContent = text || ''
  }

  /**
   * Панель может быть создана скрытой (ширина 0) — тогда рендер по нулевой
   * ширине даёт пустые страницы. Просто ждём, пока появится размер.
   */
  async function waitForSize() {
    while (pagesEl.clientWidth === 0) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  // ---------- чёткий текст: как «Чёткий текст в PDF» в LightView ----------
  //
  // Шрифты LaTeX (Type 1/CFF) не хинтуются. Текст через шрифты Chromium
  // (DirectWrite) подгоняется под сетку и теряет тонкие штрихи, поэтому глифы
  // рисуются контурами (disableFontFace) — буквы получаются цельными, как в
  // PDFium. Субпиксельное сглаживание делается так же, как в FreeType:
  // страница рисуется втрое шире, и каждые три отсчёта через LCD-фильтр
  // раскладываются по субпикселям R, G, B. Затем гамма 1.4 возвращает
  // штрихам контраст (полутона картинок при этом немного темнеют).

  const TEXT_GAMMA = (() => {
    const lut = new Uint8Array(256)
    for (let v = 0; v < 256; v++) {
      lut[v] = Math.round(255 * Math.pow(v / 255, 1.4))
    }
    return lut
  })()

  /** LCD-фильтр FreeType по умолчанию (FT_LCD_FILTER_DEFAULT): 8 77 86 77 8 */
  const LCD_FIR = [8, 77, 86, 77, 8]
  const WHITE = 0xffffffff

  /** src — RGBA шириной 3·width, dst — RGBA шириной width */
  function lcdDownsample(src, dst, width, height) {
    const src32 = new Uint32Array(src.buffer, src.byteOffset, src.length >> 2)
    const dst32 = new Uint32Array(dst.buffer, dst.byteOffset, dst.length >> 2)
    const w3 = width * 3
    for (let y = 0; y < height; y++) {
      const row = y * w3
      const rowEnd = row + w3 - 1
      for (let x = 0; x < width; x++) {
        const s = row + 3 * x
        const o = y * width + x
        // крайние столбцы — с ограничением индексов по краю строки
        if (x === 0 || x === width - 1) {
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
          dst[o * 4 + 3] = 255
          continue
        }
        // белый фон (в т. ч. соседние отсчёты фильтра) — без вычислений
        if (
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
        // субпиксель c — отсчёт s+c того же канала и по два соседа
        let p = s * 4
        dst[o * 4] = TEXT_GAMMA[
          (86 * src[p] +
            77 * (src[p - 4] + src[p + 4]) +
            8 * (src[p - 8] + src[p + 8]) +
            128) >>
            8
        ]
        p += 5 // отсчёт s+1, канал G
        dst[o * 4 + 1] = TEXT_GAMMA[
          (86 * src[p] +
            77 * (src[p - 4] + src[p + 4]) +
            8 * (src[p - 8] + src[p + 8]) +
            128) >>
            8
        ]
        p += 5 // отсчёт s+2, канал B
        dst[o * 4 + 2] = TEXT_GAMMA[
          (86 * src[p] +
            77 * (src[p - 4] + src[p + 4]) +
            8 * (src[p - 8] + src[p + 8]) +
            128) >>
            8
        ]
        dst[o * 4 + 3] = 255
      }
    }
  }

  function applyGamma(data) {
    const words = new Uint32Array(data.buffer, data.byteOffset, data.length >> 2)
    for (let i = 0; i < words.length; i++) {
      if (words[i] === WHITE) continue
      const o = i * 4
      data[o] = TEXT_GAMMA[data[o]]
      data[o + 1] = TEXT_GAMMA[data[o + 1]]
      data[o + 2] = TEXT_GAMMA[data[o + 2]]
    }
  }

  /**
   * Начало каждого глифа — в целый пиксель экрана, как в PDFium. Иначе
   * базовая линия строки попадает между строками пикселей: верх и низ букв
   * расплываются на две полупрозрачные строки, перекладины встают между
   * пикселями, и одна и та же буква в разных строках выглядит по-разному.
   * pdf.js рисует глиф контуром последовательностью save → translate(x, y)
   * → beginPath → контур → fill → restore; ловим её на нашем контексте и
   * выравниваем сдвиг как PDFium: по вертикали округление, по горизонтали
   * отбрасывание дробной части (так ближе всего к его отрисовке — проверено
   * попиксельным сравнением). stepX — ширина пикселя экрана в единицах
   * холста (3 при тройной ширине). Повёрнутый текст не трогаем.
   */
  function snapGlyphOrigins(ctx, stepX) {
    const save = ctx.save
    const translate = ctx.translate
    const beginPath = ctx.beginPath
    let state = 0 // 1 — сразу после save, 2 — после save + translate
    ctx.save = function () {
      state = 1
      return save.call(this)
    }
    ctx.translate = function (x, y) {
      state = state === 1 ? 2 : 0
      return translate.call(this, x, y)
    }
    ctx.beginPath = function () {
      if (state === 2) {
        const m = this.getTransform()
        if (m.b === 0 && m.c === 0) {
          this.setTransform(
            m.a,
            0,
            0,
            m.d,
            Math.floor(m.e / stepX) * stepX,
            Math.round(m.f)
          )
        }
      }
      state = 0
      return beginPath.call(this)
    }
    // любой другой вызов между save и translate — уже не глиф
    for (const name of [
      'transform',
      'setTransform',
      'scale',
      'rotate',
      'restore',
      'fill',
      'stroke',
      'clip',
      'drawImage',
      'fillRect',
    ]) {
      const orig = ctx[name]
      ctx[name] = function (...args) {
        state = 0
        return orig.apply(this, args)
      }
    }
  }

  /** Нарисовать страницу в новый холст pxWidth×pxHeight пикселей экрана. */
  async function paintPage(page, viewport, pxWidth, pxHeight) {
    // очень крупный масштаб: тройная ширина слишком тяжела по памяти,
    // там глифы и так крупные — достаточно гаммы
    if (pxWidth * 3 * pxHeight > 24e6) {
      const canvas = document.createElement('canvas')
      canvas.width = pxWidth
      canvas.height = pxHeight
      const ctx = canvas.getContext('2d', {
        alpha: false,
        willReadFrequently: true,
      })
      snapGlyphOrigins(ctx, 1)
      await page.render({
        canvasContext: ctx,
        viewport,
        transform: [pxWidth / viewport.width, 0, 0, pxHeight / viewport.height, 0, 0],
      }).promise
      const img = ctx.getImageData(0, 0, pxWidth, pxHeight)
      applyGamma(img.data)
      ctx.putImageData(img, 0, 0)
      return canvas
    }
    const wide = document.createElement('canvas')
    wide.width = pxWidth * 3
    wide.height = pxHeight
    const wctx = wide.getContext('2d', {
      alpha: false,
      willReadFrequently: true,
    })
    snapGlyphOrigins(wctx, 3)
    await page.render({
      canvasContext: wctx,
      viewport,
      transform: [wide.width / viewport.width, 0, 0, pxHeight / viewport.height, 0, 0],
    }).promise
    const src = wctx.getImageData(0, 0, wide.width, pxHeight).data
    const canvas = document.createElement('canvas')
    canvas.width = pxWidth
    canvas.height = pxHeight
    const ctx = canvas.getContext('2d', { alpha: false })
    const img = ctx.createImageData(pxWidth, pxHeight)
    lcdDownsample(src, img.data, pxWidth, pxHeight)
    ctx.putImageData(img, 0, 0)
    return canvas
  }

  // ---------- геометрия страниц ----------

  /**
   * Холст — целое число пикселей экрана, CSS-размер — ровно оно же / dpr,
   * тогда холст выводится 1:1. При дробном dpr (1.2 при zoomLevel 1)
   * округлённый до целых CSS-пикселей размер расходился с холстом, и браузер
   * растягивал всю страницу — текст размывался.
   */
  function geometry(page, effScale, dpr) {
    const viewport = page.getViewport({ scale: effScale })
    const pxWidth = Math.round(viewport.width * dpr)
    const pxHeight = Math.round(viewport.height * dpr)
    return {
      viewport,
      pxWidth,
      pxHeight,
      cssWidth: pxWidth / dpr,
      cssHeight: pxHeight / dpr,
      pageWidthPt: page.view[2] - page.view[0],
      pageHeightPt: page.view[3] - page.view[1],
    }
  }

  function applyGeometry(st, g) {
    st.viewport = g.viewport
    st.pxWidth = g.pxWidth
    st.pxHeight = g.pxHeight
    st.cssWidth = g.cssWidth
    st.cssHeight = g.cssHeight
    st.pageWidthPt = g.pageWidthPt
    st.pageHeightPt = g.pageHeightPt
    st.wrap.style.width = g.cssWidth + 'px'
    st.wrap.style.height = g.cssHeight + 'px'
  }

  /**
   * Заготовки получают размер первой страницы; настоящий размер страница
   * получает при загрузке. Если он другой (альбомная страница), заготовка
   * меняется, а если она выше видимой области — прокрутка компенсируется.
   */
  function updateGeometry(st) {
    const g = geometry(st.page, layoutScale, layoutDpr)
    const resized =
      g.cssWidth !== st.cssWidth || g.cssHeight !== st.cssHeight
    const above =
      resized &&
      st.wrap.isConnected &&
      st.wrap.getBoundingClientRect().bottom <= 0
    const dh = g.cssHeight - st.cssHeight
    applyGeometry(st, g)
    if (!resized) return
    if (st.canvas) {
      st.canvas.style.width = g.cssWidth + 'px'
      st.canvas.style.height = g.cssHeight + 'px'
    }
    if (st.drawn) {
      st.drawn = false
      drawQueue.add(st)
      runDrawQueue()
    }
    if (above) window.scrollBy(0, dh)
  }

  // ---------- отрисовка страниц по мере прокрутки ----------

  async function drawPage(st, doc) {
    if (st.drawn || st.drawing) return
    st.drawing = true
    try {
      if (!st.page) {
        st.page = await doc.getPage(st.num)
        if (st.gen !== generation) return
        updateGeometry(st)
      }
      const canvas = await paintPage(
        st.page,
        st.viewport,
        st.pxWidth,
        st.pxHeight
      )
      if (st.gen !== generation) return
      canvas.style.width = st.cssWidth + 'px'
      canvas.style.height = st.cssHeight + 'px'
      // старый холст остаётся на месте до готовности нового — без мигания
      if (st.canvas) {
        if (sharpObserver) sharpObserver.unobserve(st.canvas)
        st.canvas.replaceWith(canvas)
      } else {
        st.wrap.prepend(canvas)
      }
      st.canvas = canvas
      st.drawn = true
      observeSharpness(st)
      if (!st.layer) addTextLayer(st)
    } catch (e) {
      // документ заменён или закрыт во время отрисовки
      if (st.gen === generation) console.error('page', st.num, e)
    } finally {
      st.drawing = false
    }
  }

  async function addTextLayer(st) {
    const layer = document.createElement('div')
    layer.className = 'textLayer'
    layer.style.width = st.cssWidth + 'px'
    layer.style.height = st.cssHeight + 'px'
    layer.style.setProperty('--scale-factor', String(st.viewport.scale))
    st.layer = layer
    st.wrap.appendChild(layer)
    try {
      await pdfjsLib.renderTextLayer({
        textContentSource: await st.page.getTextContent(),
        container: layer,
        viewport: st.viewport,
        textDivs: [],
      }).promise
    } catch (e) {
      if (st.gen === generation) console.error('text layer:', e)
    }
  }

  /** очередь на отрисовку; первой рисуется страница, ближайшая к экрану */
  const drawQueue = new Set()
  let drawLoopRunning = false

  function distanceToViewport(st) {
    const r = st.wrap.getBoundingClientRect()
    if (r.bottom < 0) return -r.bottom
    if (r.top > window.innerHeight) return r.top - window.innerHeight
    return 0
  }

  async function runDrawQueue() {
    if (drawLoopRunning) return
    drawLoopRunning = true
    try {
      while (drawQueue.size > 0) {
        let best = null
        let bestDistance = Infinity
        for (const st of drawQueue) {
          const d = distanceToViewport(st)
          if (d < bestDistance) {
            bestDistance = d
            best = st
          }
        }
        drawQueue.delete(best)
        if (best.gen !== generation) continue
        await drawPage(best, pdfDoc)
      }
    } finally {
      drawLoopRunning = false
    }
  }

  function stateOfWrap(wrap) {
    const st = pageStates[Number(wrap.dataset.page) - 1]
    return st && st.wrap === wrap ? st : null
  }

  let nearObserver = null

  /**
   * Рисуются страницы в пределах двух экранов сверху и снизу от видимой
   * области — длинный документ открывается сразу. Нарисованные страницы
   * остаются до следующей раскладки (перекомпиляция, смена масштаба).
   * Корень — явно document: панель живёт в iframe, а там без явного корня
   * rootMargin игнорируется.
   */
  function observePages() {
    if (nearObserver) nearObserver.disconnect()
    drawQueue.clear()
    nearObserver = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          const st = stateOfWrap(e.target)
          if (!st) continue
          if (e.isIntersecting) {
            if (!st.drawn) drawQueue.add(st)
          } else {
            drawQueue.delete(st)
          }
        }
        runDrawQueue()
      },
      { root: document, rootMargin: '200% 0px' }
    )
    for (const st of pageStates) nearObserver.observe(st.wrap)
  }

  /** В фоне загрузить остальные страницы, чтобы уточнить их размеры. */
  async function fetchAllPages(doc, gen) {
    for (const st of pageStates) {
      if (gen !== generation) return
      if (st.page) continue
      try {
        const page = await doc.getPage(st.num)
        if (gen !== generation || st.page) continue
        st.page = page
        updateGeometry(st)
      } catch (e) {
        return // документ закрыт
      }
      // не занимать главный поток подряд — прокрутка остаётся плавной
      await new Promise(r => setTimeout(r, 0))
    }
  }

  // ---------- чёткость: холст 1:1 с пикселями экрана ----------

  /**
   * Браузер сообщает точный размер холста в пикселях экрана с учётом
   * округления его позиции (device-pixel-content-box). Если он разошёлся с
   * размером отрисовки — округление позиции, смена масштаба окна VS Code без
   * перерисовки, — страница перерисовывается под этот размер.
   */
  let sharpObserver = null

  function createSharpObserver() {
    if (sharpObserver) sharpObserver.disconnect()
    sharpObserver = null
    if (typeof ResizeObserver === 'undefined') return
    sharpObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const box =
          entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize[0]
        const wrap = entry.target.parentElement
        const st = wrap && stateOfWrap(wrap)
        if (!box || !st || st.canvas !== entry.target) continue
        const width = Math.round(box.inlineSize)
        const height = Math.round(box.blockSize)
        if (width <= 0 || height <= 0) continue
        if (width === st.pxWidth && height === st.pxHeight) continue
        st.pxWidth = width
        st.pxHeight = height
        st.drawn = false
        drawQueue.add(st)
      }
      runDrawQueue()
    })
  }

  function observeSharpness(st) {
    if (!sharpObserver || !st.canvas || !st.canvas.isConnected) return
    try {
      sharpObserver.observe(st.canvas, { box: 'device-pixel-content-box' })
    } catch (e) {
      // движок без device-pixel-content-box — остаётся первичная отрисовка
      sharpObserver.disconnect()
      sharpObserver = null
    }
  }

  // ---------- раскладка документа ----------

  /**
   * Раскладка: заготовки всех страниц в невидимом фрагменте, заранее
   * рисуются только те, что окажутся на экране, затем одна подмена и одна
   * установка прокрутки. Пока готовится новая раскладка, на экране остаётся
   * прежняя на своём месте; остальные страницы рисуются по мере прокрутки.
   */
  async function layout(preserveScroll) {
    const doc = incomingDoc || pdfDoc
    if (!doc) return
    if (laying) {
      pendingLayout = true
      return
    }
    laying = true
    const gen = ++generation
    const superseded = () => (incomingDoc || pdfDoc) !== doc
    try {
      await waitForSize()
      lastLayoutWidth = pagesEl.clientWidth
      const savedScroll = preserveScroll ? window.scrollY : 0
      // читаем каждый раз: меняется с масштабом окна VS Code (window.zoomLevel)
      const dpr = window.devicePixelRatio || 1

      const first = await doc.getPage(1)
      if (superseded()) return
      const vp0 = first.getViewport({ scale: 1 })
      const effScale = fitWidth
        ? Math.max(0.3, (pagesEl.clientWidth - 32) / vp0.width)
        : scale
      // абсолютная прокрутка в пикселях; при смене масштаба — пропорционально
      const targetScroll =
        prevScale > 0 ? (savedScroll * effScale) / prevScale : savedScroll
      layoutScale = effScale
      layoutDpr = dpr

      const g0 = geometry(first, effScale, dpr)
      const frag = document.createDocumentFragment()
      const states = []
      for (let i = 1; i <= doc.numPages; i++) {
        const wrap = document.createElement('div')
        wrap.className = 'page-wrap'
        wrap.dataset.page = String(i)
        const st = {
          num: i,
          gen,
          wrap,
          page: i === 1 ? first : null,
          canvas: null,
          layer: null,
          drawn: false,
          drawing: false,
        }
        applyGeometry(st, g0)
        frag.appendChild(wrap)
        states.push(st)
      }

      // какие страницы окажутся на экране после подмены
      const style = getComputedStyle(pagesEl)
      const padTop = parseFloat(style.paddingTop) || 0
      const padBottom = parseFloat(style.paddingBottom) || 0
      const gap = parseFloat(style.rowGap) || 0
      const docTop = pagesEl.offsetTop + padTop
      const pitch = g0.cssHeight + gap
      const n = states.length
      const total = docTop + n * pitch - gap + padBottom
      const top = Math.min(
        targetScroll,
        Math.max(0, total - window.innerHeight)
      )
      const clampIdx = v => Math.min(n - 1, Math.max(0, Math.floor(v)))
      const firstVisible = clampIdx((top - docTop) / pitch)
      const lastVisible = clampIdx(
        (top + window.innerHeight - docTop) / pitch
      )
      for (let i = firstVisible; i <= lastVisible; i++) {
        await drawPage(states[i], doc)
        if (superseded()) return
      }

      // готово — мгновенная подмена и единственная установка прокрутки
      pagesEl.replaceChildren(frag)
      pageStates.length = 0
      for (const st of states) pageStates.push(st)
      prevScale = effScale
      zoomLabel.textContent = Math.round(effScale * 100) + '%'
      pageInfoEl.textContent = 'страниц: ' + doc.numPages
      const max = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo(0, Math.min(targetScroll, Math.max(0, max)))
      if (doc !== pdfDoc) {
        const old = pdfDoc
        pdfDoc = doc
        if (incomingDoc === doc) incomingDoc = null
        if (old) old.destroy()
      }
      setStatus('')
      createSharpObserver()
      for (const st of states) observeSharpness(st)
      observePages()
      fetchAllPages(doc, gen)
    } catch (e) {
      if (!superseded()) {
        console.error(e)
        setStatus('ошибка отрисовки PDF')
      }
    } finally {
      laying = false
      if (pendingLayout || superseded()) {
        pendingLayout = false
        layout(true)
      }
    }
  }

  async function loadPdf(url) {
    const ticket = ++loadTicket
    setStatus('загрузка…')
    let doc
    try {
      doc = await pdfjsLib.getDocument({
        url,
        disableFontFace: true,
        // CSP панели запрещает eval — pdf.js не будет и пробовать
        isEvalSupported: false,
      }).promise
    } catch (err) {
      console.error(err)
      if (ticket === loadTicket) setStatus('ошибка загрузки PDF')
      return
    }
    if (ticket !== loadTicket) {
      doc.destroy() // пока грузился, пришёл более новый PDF
      return
    }
    if (incomingDoc) incomingDoc.destroy() // так и не был показан
    incomingDoc = doc
    await layout(true)
  }

  // ---------- слово под курсором (из текстового слоя) ----------

  function wordAtPoint(x, y) {
    let range = null
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y)
    } else if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y)
      if (p) {
        range = document.createRange()
        range.setStart(p.offsetNode, p.offset)
      }
    }
    const node = range && range.startContainer
    if (!node || node.nodeType !== Node.TEXT_NODE) return null
    const text = node.textContent || ''
    // стандартная токенизация (буква|цифра)+ — как при поиске в исходнике
    const isW = ch => /[\p{L}\p{N}]/u.test(ch)
    let s = range.startOffset
    let e = s
    while (s > 0 && isW(text[s - 1])) s--
    while (e < text.length && isW(text[e])) e++
    const w = text.slice(s, e)
    return w.length >= 1 ? w : null
  }

  // ---------- обратный SyncTeX: Ctrl/Cmd+Click ----------

  pagesEl.addEventListener('click', e => {
    if (!e.ctrlKey && !e.metaKey) return
    const wrap = e.target.closest('.page-wrap')
    if (!wrap) return
    const state = stateOfWrap(wrap)
    if (!state || !state.page) return
    const rect = state.wrap.getBoundingClientRect()
    const cssX = e.clientX - rect.left
    const cssY = e.clientY - rect.top
    const [pdfX, pdfY] = state.viewport.convertToPdfPoint(cssX, cssY)
    // synctex использует начало координат сверху-слева
    vscode.postMessage({
      type: 'syncToCode',
      page: state.num,
      h: pdfX,
      v: state.pageHeightPt - pdfY,
      word: wordAtPoint(e.clientX, e.clientY),
    })
  })

  // ---------- подсветка позиции (forward SyncTeX) ----------

  let highlightEl = null
  function showHighlight(msg) {
    const state = pageStates[msg.page - 1]
    if (!state) return
    const k = state.wrap.getBoundingClientRect().width / state.pageWidthPt
    if (highlightEl) highlightEl.remove()
    const el = document.createElement('div')
    el.className = 'synctex-highlight'
    const hPt = Number(msg.h) || 0
    const vPt = Number(msg.v) || 0
    const wPt = Number(msg.width) || 0
    const hgtPt = Number(msg.height) || 0
    // v приходит от верхнего края страницы; высота может быть 0 — рисуем полосу
    el.style.left = Math.max(0, (hPt - 2) * k) + 'px'
    el.style.top = Math.max(0, (vPt - (hgtPt || 12)) * k) + 'px'
    el.style.width =
      (wPt > 1 ? wPt * k : state.pageWidthPt * k - hPt * k - 8) + 'px'
    el.style.height = ((hgtPt || 12) + 4) * k + 'px'
    state.wrap.appendChild(el)
    highlightEl = el
    state.wrap.scrollIntoView({ block: 'center' })
    setTimeout(() => {
      el.classList.add('fade')
      setTimeout(() => el.remove(), 900)
    }, 1800)
  }

  /** масштаб на экране: в режиме «по ширине» — фактический, а не прежний ручной */
  function shownScale() {
    return fitWidth && prevScale > 0 ? prevScale : scale || 1
  }
  document.getElementById('zoom-in').addEventListener('click', () => {
    scale = Math.min(4, shownScale() * 1.2)
    fitWidth = false
    layout(true)
  })
  document.getElementById('zoom-out').addEventListener('click', () => {
    scale = Math.max(0.3, shownScale() / 1.2)
    fitWidth = false
    layout(true)
  })
  document.getElementById('fit-width').addEventListener('click', () => {
    fitWidth = true
    layout(true)
  })

  let resizeTimer = null
  window.addEventListener('resize', () => {
    if (!fitWidth) return
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      // скрытие/показ вкладки тоже даёт resize — перерисовываем только
      // когда ширина действительно изменилась
      if (pagesEl.clientWidth === lastLayoutWidth) return
      layout(true)
    }, 200)
  })

  // ---------- пустое состояние (PDF ещё не собран) ----------

  let emptyEl = null
  function showEmpty() {
    setStatus('')
    if (emptyEl) return
    emptyEl = document.createElement('div')
    emptyEl.id = 'empty-state'
    const text = document.createElement('p')
    text.textContent = 'PDF ещё не собран'
    const btn = document.createElement('button')
    btn.textContent = '▶ Компилировать'
    btn.addEventListener('click', () => vscode.postMessage({ type: 'compile' }))
    emptyEl.appendChild(text)
    emptyEl.appendChild(btn)
    pagesEl.appendChild(emptyEl)
  }
  function hideEmpty() {
    if (emptyEl) {
      emptyEl.remove()
      emptyEl = null
    }
  }

  window.addEventListener('message', event => {
    const msg = event.data
    if (!msg) return
    if (msg.type === 'load') {
      hideEmpty()
      // состояние для восстановления вкладки после перезагрузки окна
      if (msg.state) vscode.setState(msg.state)
      loadPdf(msg.url)
    } else if (msg.type === 'highlight') showHighlight(msg)
    else if (msg.type === 'empty') showEmpty()
  })

  setStatus('ожидание PDF…')
  // сообщения, отправленные до загрузки этого скрипта, теряются —
  // расширение копит их в очереди и шлёт после 'ready'
  vscode.postMessage({ type: 'ready' })
})()

/* global pdfjsLib, acquireVsCodeApi */
(function () {
  'use strict'

  pdfjsLib.GlobalWorkerOptions.workerSrc = document.body.dataset.workerSrc
  const vscode = acquireVsCodeApi()

  const pagesEl = document.getElementById('pages')
  const statusEl = document.getElementById('status')
  const pageInfoEl = document.getElementById('page-info')
  const zoomLabel = document.getElementById('zoom-label')

  let pdfDoc = null
  let scale = 1.0
  let fitWidth = true
  let rendering = false
  let pendingLayout = false
  const pageStates = [] // {num, wrap, canvas, viewport, pageWidthPt, pageHeightPt}

  const dpr = Math.max(1, window.devicePixelRatio || 1)

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

  /**
   * Полная отрисовка: все страницы по порядку, каждая — canvas + текстовый
   * слой (выделение текста и слово под курсором для SyncTeX). Никакой
   * ленивой отрисовки: загрузили — нарисовали, состояние одно.
   */
  async function layout(preserveScroll) {
    if (!pdfDoc) return
    if (rendering) {
      pendingLayout = true
      return
    }
    rendering = true
    try {
      await waitForSize()
      const scrollRatio =
        preserveScroll && document.documentElement.scrollHeight > 0
          ? window.scrollY / document.documentElement.scrollHeight
          : 0

      pagesEl.textContent = ''
      pageStates.length = 0

      const first = await pdfDoc.getPage(1)
      const vp0 = first.getViewport({ scale: 1 })
      const effScale = fitWidth
        ? Math.max(0.3, (pagesEl.clientWidth - 32) / vp0.width)
        : scale
      zoomLabel.textContent = Math.round(effScale * 100) + '%'
      pageInfoEl.textContent = 'страниц: ' + pdfDoc.numPages

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        setStatus(`отрисовка ${i}/${pdfDoc.numPages}…`)
        const page = i === 1 ? first : await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: effScale })

        const wrap = document.createElement('div')
        wrap.className = 'page-wrap'
        wrap.dataset.page = String(i)
        wrap.style.width = Math.floor(viewport.width) + 'px'
        wrap.style.height = Math.floor(viewport.height) + 'px'
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = Math.floor(viewport.width) + 'px'
        canvas.style.height = Math.floor(viewport.height) + 'px'
        wrap.appendChild(canvas)
        pagesEl.appendChild(wrap)

        await page.render({
          canvasContext: canvas.getContext('2d'),
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        }).promise

        // текстовый слой: выделение текста + слово под курсором
        try {
          const textContent = await page.getTextContent()
          const layer = document.createElement('div')
          layer.className = 'textLayer'
          layer.style.width = canvas.style.width
          layer.style.height = canvas.style.height
          layer.style.setProperty('--scale-factor', String(effScale))
          wrap.appendChild(layer)
          await pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: layer,
            viewport,
            textDivs: [],
          }).promise
        } catch (e) {
          console.error('text layer:', e)
        }

        pageStates.push({
          num: i,
          wrap,
          canvas,
          viewport,
          pageWidthPt: page.view[2] - page.view[0],
          pageHeightPt: page.view[3] - page.view[1],
        })
      }
      setStatus('')
      if (preserveScroll) {
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollRatio * document.documentElement.scrollHeight)
        })
      }
    } finally {
      rendering = false
      if (pendingLayout) {
        pendingLayout = false
        layout(true)
      }
    }
  }

  async function loadPdf(base64) {
    setStatus('загрузка…')
    try {
      const raw = atob(base64)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
      if (pdfDoc) {
        try {
          pdfDoc.destroy()
        } catch (e) {
          /* ignore */
        }
      }
      pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise
      await layout(true)
    } catch (err) {
      console.error(err)
      setStatus('ошибка загрузки PDF')
    }
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
    const isW = ch => /[0-9A-Za-zА-Яа-яЁёÀ-ɏ-]/.test(ch)
    let s = range.startOffset
    let e = s
    while (s > 0 && isW(text[s - 1])) s--
    while (e < text.length && isW(text[e])) e++
    const w = text.slice(s, e)
    return w.length >= 2 ? w : null
  }

  // ---------- обратный SyncTeX: Ctrl/Cmd+Click ----------

  pagesEl.addEventListener('click', e => {
    if (!e.ctrlKey && !e.metaKey) return
    const wrap = e.target.closest('.page-wrap')
    if (!wrap) return
    const state = pageStates[Number(wrap.dataset.page) - 1]
    if (!state || !state.viewport) return
    const rect = state.canvas.getBoundingClientRect()
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
    if (!state || !state.viewport) return
    const k = state.canvas.getBoundingClientRect().width / state.pageWidthPt
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

  document.getElementById('zoom-in').addEventListener('click', () => {
    fitWidth = false
    scale = Math.min(4, (scale || 1) * 1.2)
    layout(true)
  })
  document.getElementById('zoom-out').addEventListener('click', () => {
    fitWidth = false
    scale = Math.max(0.3, (scale || 1) / 1.2)
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
    resizeTimer = setTimeout(() => layout(true), 200)
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
      loadPdf(msg.data)
    } else if (msg.type === 'highlight') showHighlight(msg)
    else if (msg.type === 'empty') showEmpty()
  })

  setStatus('ожидание PDF…')
  // сообщения, отправленные до загрузки этого скрипта, теряются —
  // расширение копит их в очереди и шлёт после 'ready'
  vscode.postMessage({ type: 'ready' })
})()

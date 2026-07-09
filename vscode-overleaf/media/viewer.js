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
  const pageStates = [] // {num, wrap, canvas, rendered, page, viewport, pageHeightPt, pageWidthPt}

  const dpr = Math.max(1, window.devicePixelRatio || 1)

  function setStatus(text) {
    statusEl.textContent = text || ''
  }

  function currentFitScale(page) {
    const viewport = page.getViewport({ scale: 1 })
    const available = pagesEl.clientWidth - 32
    return Math.max(0.3, available / viewport.width)
  }

  async function renderPage(state) {
    if (state.rendered || !pdfDoc) return
    state.rendered = true
    const page = state.page || (state.page = await pdfDoc.getPage(state.num))
    const effScale = fitWidth ? currentFitScale(page) : scale
    const viewport = page.getViewport({ scale: effScale })
    state.viewport = viewport
    state.pageWidthPt = page.view[2] - page.view[0]
    state.pageHeightPt = page.view[3] - page.view[1]
    const canvas = state.canvas
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = Math.floor(viewport.width) + 'px'
    canvas.style.height = Math.floor(viewport.height) + 'px'
    state.wrap.style.width = canvas.style.width
    state.wrap.style.height = canvas.style.height
    const ctx = canvas.getContext('2d')
    await page.render({
      canvasContext: ctx,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    }).promise
  }

  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const idx = Number(entry.target.dataset.page) - 1
          const state = pageStates[idx]
          if (state) renderPage(state).catch(console.error)
        }
      }
    },
    { root: null, rootMargin: '600px 0px' }
  )

  async function layout(preserveScroll) {
    if (!pdfDoc || rendering) return
    rendering = true
    const scrollRatio =
      preserveScroll && document.documentElement.scrollHeight > 0
        ? window.scrollY / document.documentElement.scrollHeight
        : 0

    observer.disconnect()
    pagesEl.textContent = ''
    pageStates.length = 0

    // размеры-заглушки по первой странице, чтобы скролл был стабильным
    const first = await pdfDoc.getPage(1)
    const effScale = fitWidth ? currentFitScale(first) : scale
    const vp1 = first.getViewport({ scale: effScale })
    zoomLabel.textContent = Math.round(effScale * 100) + '%'

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const wrap = document.createElement('div')
      wrap.className = 'page-wrap'
      wrap.dataset.page = String(i)
      wrap.style.width = Math.floor(vp1.width) + 'px'
      wrap.style.height = Math.floor(vp1.height) + 'px'
      const canvas = document.createElement('canvas')
      canvas.style.width = Math.floor(vp1.width) + 'px'
      canvas.style.height = Math.floor(vp1.height) + 'px'
      wrap.appendChild(canvas)
      pagesEl.appendChild(wrap)
      pageStates.push({
        num: i,
        wrap,
        canvas,
        rendered: false,
        page: i === 1 ? first : null,
        viewport: null,
        pageWidthPt: 0,
        pageHeightPt: 0,
      })
      observer.observe(wrap)
    }
    pageInfoEl.textContent = 'страниц: ' + pdfDoc.numPages

    rendering = false
    if (preserveScroll) {
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollRatio * document.documentElement.scrollHeight)
      })
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
      setStatus('')
    } catch (err) {
      console.error(err)
      setStatus('ошибка загрузки PDF')
    }
  }

  // ---------- обратный SyncTeX: Ctrl/Cmd+Click ----------

  pagesEl.addEventListener('click', async e => {
    if (!e.ctrlKey && !e.metaKey) return
    const wrap = e.target.closest('.page-wrap')
    if (!wrap) return
    const idx = Number(wrap.dataset.page) - 1
    const state = pageStates[idx]
    if (!state) return
    if (!state.rendered) await renderPage(state)
    if (!state.viewport) return
    const rect = state.canvas.getBoundingClientRect()
    const cssX = e.clientX - rect.left
    const cssY = e.clientY - rect.top
    const [pdfX, pdfY] = state.viewport.convertToPdfPoint(cssX, cssY)
    // synctex использует начало координат сверху-слева
    const h = pdfX
    const v = state.pageHeightPt - pdfY
    vscode.postMessage({ type: 'syncToCode', page: state.num, h, v })
  })

  // ---------- подсветка позиции (forward SyncTeX) ----------

  let highlightEl = null
  async function showHighlight(msg) {
    const state = pageStates[msg.page - 1]
    if (!state) return
    if (!state.rendered) await renderPage(state)
    if (!state.viewport) return
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
    el.style.width = (wPt > 1 ? wPt * k : state.pageWidthPt * k - hPt * k - 8) + 'px'
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

  window.addEventListener('message', event => {
    const msg = event.data
    if (!msg) return
    if (msg.type === 'load') loadPdf(msg.data)
    else if (msg.type === 'highlight') showHighlight(msg)
  })

  setStatus('ожидание PDF…')
})()

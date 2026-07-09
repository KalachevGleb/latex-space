/**
 * Сквозной смоук-тест API-клиента против живого сервера LatexSpace.
 * Использование:
 *   LATEXSPACE_URL=http://localhost LATEXSPACE_EMAIL=... LATEXSPACE_PASSWORD=... \
 *     npx esbuild scripts/smoke.ts --bundle --platform=node --outfile=out/smoke.js && node out/smoke.js
 */
import AdmZip from 'adm-zip'
import { LatexSpaceClient } from '../src/api/client'

const SERVER = process.env.LATEXSPACE_URL ?? 'http://localhost'
const EMAIL = process.env.LATEXSPACE_EMAIL ?? 'plugin-test@example.com'
const PASSWORD = process.env.LATEXSPACE_PASSWORD ?? ''

let passed = 0
let failed = 0

function ok(name: string, cond: unknown, detail = ''): void {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main(): Promise<void> {
  if (!PASSWORD) throw new Error('LATEXSPACE_PASSWORD не задан')
  const client = new LatexSpaceClient({
    serverUrl: SERVER,
    email: EMAIL,
    password: PASSWORD,
  })

  console.log('1. Аутентификация (cookie + CSRF)')
  await client.checkAuth()
  ok('вход и доступ к /user/projects', true)

  console.log('2. Создание проекта')
  const name = `Plugin Smoke Test ${new Date().toISOString().slice(0, 16)}`
  const projectId = await client.createProject(name)
  ok('проект создан', /^[0-9a-f]{24}$/.test(projectId), projectId)

  const projects = await client.listProjects()
  const listed = projects.find(p => p.id === projectId)
  ok('проект в списке (с датой)', !!listed?.lastUpdated, listed?.lastUpdated)

  console.log('3. Отправка файлов (upload-by-path)')
  const mainTex = Buffer.from(
    [
      '\\documentclass{article}',
      '\\begin{document}',
      'Hello from the VSCode plugin! $E = mc^2$',
      '\\input{sections/intro}',
      '\\end{document}',
      '',
    ].join('\n'),
    'utf8'
  )
  const up1 = await client.uploadByPath(projectId, 'main.tex', mainTex)
  ok('main.tex загружен', up1.success && up1.entity_type === 'doc')
  const up2 = await client.uploadByPath(
    projectId,
    'sections/intro.tex',
    Buffer.from('Intro section text.\n', 'utf8')
  )
  ok(
    'sections/intro.tex загружен (автосоздание папки)',
    up2.success,
    String(up2.path)
  )
  // повторная загрузка того же файла (перезапись с сохранением истории)
  const up3 = await client.uploadByPath(
    projectId,
    'sections/intro.tex',
    Buffer.from('Intro section text, updated.\n', 'utf8')
  )
  ok('повторная загрузка (upsert)', up3.success && up3.isNew === false)

  console.log('4. Структура и скачивание')
  const entities = await client.getEntities(projectId)
  const paths = entities.map(e => e.path)
  ok(
    'entities содержит оба файла',
    paths.includes('/main.tex') && paths.includes('/sections/intro.tex'),
    paths.join(', ')
  )
  const zip = await client.downloadZip(projectId)
  const zipEntries = new AdmZip(zip)
    .getEntries()
    .filter(e => !e.isDirectory)
    .map(e => e.entryName)
  ok(
    'zip содержит файлы',
    zipEntries.includes('main.tex') &&
      zipEntries.some(e => e.endsWith('intro.tex')),
    zipEntries.join(', ')
  )
  const zipMain = new AdmZip(zip).getEntry('main.tex')?.getData().toString()
  ok('содержимое main.tex совпадает', zipMain === mainTex.toString())

  console.log('5. Версия истории (для опроса изменений)')
  const v1 = await client.getLatestVersion(projectId)
  ok('версия > 0', v1 > 0, `v${v1}`)
  await client.uploadByPath(
    projectId,
    'main.tex',
    Buffer.from(mainTex.toString().replace('Hello', 'Hello again'), 'utf8')
  )
  // history обрабатывает очередь асинхронно — подождём
  let v2 = v1
  for (let i = 0; i < 20 && v2 <= v1; i++) {
    await new Promise(r => setTimeout(r, 500))
    v2 = await client.getLatestVersion(projectId)
  }
  ok('версия выросла после изменения', v2 > v1, `v${v1} → v${v2}`)

  console.log('6. Полная синхронизация из ZIP (с удалением)')
  const syncZip = new AdmZip()
  syncZip.addFile(
    'main.tex',
    Buffer.from(
      '\\documentclass{article}\n\\begin{document}\nSynced from zip.\n\\end{document}\n',
      'utf8'
    )
  )
  syncZip.addFile('extra.bib', Buffer.from('% bib\n', 'utf8'))
  const syncRes = await client.syncFromZip(projectId, syncZip.toBuffer())
  ok('sync-from-zip успешен', syncRes.success, JSON.stringify(syncRes))
  const entities2 = (await client.getEntities(projectId)).map(e => e.path)
  ok(
    'intro.tex удалён, extra.bib добавлен',
    !entities2.includes('/sections/intro.tex') &&
      entities2.includes('/extra.bib'),
    entities2.join(', ')
  )

  console.log('7. Комментарии (чтение и ответ)')
  const comments = await client.getComments(projectId)
  ok('GET comments отвечает', Array.isArray(comments), `${comments.length} шт.`)
  const rangesRes = await client.getRanges(projectId)
  ok('GET ranges отвечает', Array.isArray(rangesRes))
  // создать тред ответом (без якоря в тексте — якорь ставится только из браузера)
  const threadId = [...Array(24)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('')
  const msg = await client.replyToThread(
    projectId,
    threadId,
    'Сообщение из смоук-теста плагина'
  )
  ok('сообщение в тред создано', !!msg && typeof msg === 'object')

  console.log('8. Компиляция на сервере')
  try {
    const editorId = '11111111-2222-3333-4444-555555555555'
    const compileRes = await client.compile(projectId, {
      compiler: 'pdflatex',
      draft: false,
      incrementalCompilesEnabled: true,
      editorId,
    })
    ok(
      `compile ответил (status=${compileRes.status})`,
      typeof compileRes.status === 'string'
    )
    const pdf = compileRes.outputFiles?.find(f => f.path === 'output.pdf')
    if (compileRes.status === 'success' && pdf) {
      const pdfBuf = await client.downloadOutputFile(
        pdf.url,
        compileRes.clsiServerId
      )
      ok(
        'PDF скачан и валиден',
        pdfBuf.subarray(0, 5).toString() === '%PDF-',
        `${(pdfBuf.length / 1024).toFixed(1)} КБ`
      )
      const log = compileRes.outputFiles?.find(f => f.path === 'output.log')
      if (log) {
        const logBuf = await client.downloadOutputFile(
          log.url,
          compileRes.clsiServerId
        )
        ok('лог скачан', logBuf.length > 0, `${logBuf.length} байт`)
      }

      console.log('9. SyncTeX (код ↔ PDF)')
      const buildId =
        compileRes.buildId ?? compileRes.outputFiles?.find(f => f.build)?.build
      const syncParams = {
        editorId,
        buildId: String(buildId),
        clsiServerId: compileRes.clsiServerId,
      }
      const fwd = await client.syncCode(projectId, 'main.tex', 3, 1, syncParams)
      ok(
        'sync/code: код → PDF',
        fwd.length > 0 && fwd[0].page >= 1,
        JSON.stringify(fwd[0])
      )
      if (fwd.length > 0) {
        const p = fwd[0]
        const back = await client.syncPdf(
          projectId,
          p.page,
          p.h + 5,
          p.v - 2,
          syncParams
        )
        ok(
          'sync/pdf: PDF → код',
          back.length > 0 && /main\.tex$/.test(back[0].file),
          JSON.stringify(back[0])
        )
      }
    } else {
      console.log(
        `  ! компиляция не успешна (status=${compileRes.status}) — возможно, нет texlive-образа в dev`
      )
    }
  } catch (err) {
    ok('compile', false, err instanceof Error ? err.message : String(err))
  }

  console.log(`\nИтог: ${passed} прошло, ${failed} упало`)
  console.log(`Тестовый проект на сервере: «${name}» (${projectId})`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})

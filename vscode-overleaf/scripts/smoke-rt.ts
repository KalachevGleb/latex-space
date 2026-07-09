/**
 * Живой тест реального времени: два OT-клиента + REST против dev-сервера.
 *   LATEXSPACE_PASSWORD=... npx esbuild scripts/smoke-rt.ts --bundle --platform=node \
 *     --outfile=out/smoke-rt.js && node out/smoke-rt.js
 */
import AdmZip from 'adm-zip'
import { LatexSpaceClient } from '../src/api/client'
import { OtDoc, OtUpdate } from '../src/realtime/docClient'
import { SioClient } from '../src/realtime/socketClient'
import RangesTracker from '../src/vendor/rangesTracker'

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

async function waitFor(
  cond: () => boolean,
  what: string,
  timeoutMs = 10_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (cond()) return true
    await new Promise(r => setTimeout(r, 50))
  }
  console.error(`  ! таймаут ожидания: ${what}`)
  return false
}

const decodeLine = (l: string): string => decodeURIComponent(escape(l))

interface RtPeer {
  name: string
  sio: SioClient
  publicId: string
  doc?: OtDoc
}

async function connectPeer(
  name: string,
  cookie: string,
  projectId: string
): Promise<{ peer: RtPeer; project: Record<string, unknown> }> {
  const sio = new SioClient({ serverUrl: SERVER, projectId, cookie })
  const peer: RtPeer = { name, sio, publicId: '' }
  let project: Record<string, unknown> = {}
  const joined = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('нет joinProjectResponse')), 10_000)
    sio.onEvent = (evName, args) => {
      if (evName === 'joinProjectResponse') {
        clearTimeout(t)
        const resp = args[0] as Record<string, unknown>
        peer.publicId = String(resp.publicId)
        project = resp.project as Record<string, unknown>
        resolve()
      } else if (evName === 'otUpdateApplied' && peer.doc) {
        const update = args[0] as OtUpdate
        if (update.doc === peer.doc.docId) {
          peer.doc.handleUpdate(update, peer.publicId)
        }
      } else if (evName === 'connectionRejected') {
        clearTimeout(t)
        reject(new Error(`rejected: ${JSON.stringify(args[0])}`))
      }
    }
  })
  await sio.connect()
  await joined
  return { peer, project }
}

async function joinDoc(peer: RtPeer, docId: string): Promise<void> {
  const args = await peer.sio.emitWithAck('joinDoc', [docId, -1, {}])
  if (args[0]) throw new Error(`joinDoc: ${JSON.stringify(args[0])}`)
  const lines = (args[1] as string[]).map(decodeLine)
  const version = Number(args[2])
  const doc = new OtDoc(docId, lines.join('\n'), version)
  doc.onSend = update => {
    void peer.sio.emitWithAck('applyOtUpdate', [docId, update]).then(ack => {
      if (ack[0]) console.error(`  ! applyOtUpdate отклонён: ${JSON.stringify(ack[0])}`)
    })
  }
  peer.doc = doc
}

function findMainDocId(project: Record<string, unknown>): string | null {
  const root = (project.rootFolder as Array<Record<string, unknown>>)?.[0]
  for (const d of (root?.docs as Array<Record<string, unknown>>) ?? []) {
    if (d.name === 'main.tex') return String(d._id)
  }
  return null
}

async function main(): Promise<void> {
  if (!PASSWORD) throw new Error('LATEXSPACE_PASSWORD не задан')
  const rest = new LatexSpaceClient({
    serverUrl: SERVER,
    email: EMAIL,
    password: PASSWORD,
  })

  console.log('1. Подготовка проекта')
  const projectId = await rest.createProject(
    `RT Smoke ${new Date().toISOString().slice(0, 16)}`
  )
  const initial = 'Line one.\nLine two.\nLine three.\n'
  await rest.uploadByPath(projectId, 'main.tex', Buffer.from(initial, 'utf8'))
  ok('проект создан', /^[0-9a-f]{24}$/.test(projectId), projectId)

  console.log('2. Подключение по websocket (cookie-сессия)')
  const cookie = await rest.getWsCookieHeader()
  const { peer: A, project } = await connectPeer('A', cookie, projectId)
  ok('joinProjectResponse получен', !!A.publicId, `publicId=${A.publicId}`)
  const docId = findMainDocId(project)
  ok('docId main.tex найден в дереве', !!docId, String(docId))
  if (!docId) process.exit(1)

  console.log('3. joinDoc и локальная правка клиента A')
  await joinDoc(A, docId)
  ok('joinDoc: текст совпадает', A.doc!.text === initial, `v${A.doc!.version}`)
  A.doc!.localChange([{ p: 0, i: 'A1: ' }])
  const acked = await waitFor(() => !A.doc!.hasPending(), 'ack операции A')
  ok('операция A подтверждена (ack)', acked, `v${A.doc!.version}`)

  console.log('4. Второй клиент B видит правку и правит сам')
  const { peer: B } = await connectPeer('B', cookie, projectId)
  await joinDoc(B, docId)
  ok(
    'B видит текст с правкой A',
    B.doc!.text.startsWith('A1: Line one.'),
    JSON.stringify(B.doc!.text.slice(0, 20))
  )
  const bInsert = 'B1: '
  B.doc!.localChange([{ p: B.doc!.text.indexOf('Line two.'), i: bInsert }])
  const aGotIt = await waitFor(
    () => A.doc!.text.includes(bInsert),
    'доставка правки B клиенту A'
  )
  ok('A получил правку B в реальном времени', aGotIt)

  console.log('5. Конкурентные правки (одновременно, без ожидания ack)')
  const posA = A.doc!.text.length
  A.doc!.localChange([{ p: posA, i: 'tail-A ' }])
  B.doc!.localChange([{ p: 0, i: 'head-B ' }])
  const converged = await waitFor(
    () =>
      !A.doc!.hasPending() &&
      !B.doc!.hasPending() &&
      A.doc!.text === B.doc!.text,
    'сходимость после конкурентных правок',
    15_000
  )
  ok(
    'тексты сошлись (OT-трансформация)',
    converged &&
      A.doc!.text.includes('tail-A') &&
      A.doc!.text.includes('head-B'),
    converged ? `v${A.doc!.version}` : `A=${JSON.stringify(A.doc!.text)} B=${JSON.stringify(B.doc!.text)}`
  )

  console.log('6. Внешнее изменение через REST приходит как OT-операция')
  const before = A.doc!.text
  const external = before.replace('Line three.', 'Line three, edited externally.')
  await rest.uploadByPath(projectId, 'main.tex', Buffer.from(external, 'utf8'))
  const gotExternal = await waitFor(
    () => A.doc!.text.includes('edited externally') && B.doc!.text === A.doc!.text,
    'доставка внешней правки live-клиентам'
  )
  ok('REST-правка пришла live-клиентам как OT', gotExternal)

  console.log('7. Итоговое содержимое на сервере совпадает с моделью')
  // дождаться сброса doc-updater в mongo через скачивание zip (download делает flush)
  await new Promise(r => setTimeout(r, 500))
  const zip = await rest.downloadZip(projectId)
  const serverMain = new AdmZip(zip).getEntry('main.tex')?.getData().toString()
  ok(
    'zip == модель клиента',
    serverMain === A.doc!.text,
    serverMain === A.doc!.text ? `${A.doc!.text.length} байт` : `server=${JSON.stringify(serverMain)}`
  )

  console.log('8. Комментарий: тред (REST) + якорь (OT-операция)')
  const threadId = [...Array(24)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('')
  await rest.replyToThread(projectId, threadId, 'Комментарий из smoke-rt')
  const quoteStart = A.doc!.text.indexOf('Line two.')
  A.doc!.localChange([
    { p: quoteStart, c: 'Line two.', t: threadId } as never,
  ])
  const anchorAcked = await waitFor(
    () => !A.doc!.hasPending(),
    'ack якорной операции'
  )
  ok('якорная операция подтверждена', anchorAcked)
  await rest.downloadZip(projectId) // форсирует flush в docstore
  const ranges1 = await rest.getRanges(projectId)
  const anchored = ranges1.some(d =>
    d.ranges?.comments?.some(
      c => c.op?.t === threadId && c.op?.p === quoteStart
    )
  )
  ok('якорь виден в ranges с верной позицией', anchored, `p=${quoteStart}`)

  console.log('9. Track changes: вставка с meta.tc')
  const seed = RangesTracker.generateIdSeed()
  const origSend = A.doc!.onSend!
  A.doc!.onSend = update => {
    origSend({ ...update, meta: { tc: seed } } as never)
  }
  const tcText = 'TRACKED '
  A.doc!.localChange([{ p: 0, i: tcText }])
  const tcAcked = await waitFor(() => !A.doc!.hasPending(), 'ack tc-операции')
  A.doc!.onSend = origSend
  ok('tc-операция подтверждена', tcAcked)
  await rest.downloadZip(projectId)
  const ranges2 = await rest.getRanges(projectId)
  interface RawChange {
    id?: string
    op?: { i?: string; p?: number }
  }
  let changeId: string | undefined
  // /ranges в этом форке не возвращает id документа — берём docId из дерева
  const changeDocId = docId
  for (const d of ranges2 as Array<{ ranges?: { changes?: RawChange[] } }>) {
    for (const ch of d.ranges?.changes ?? []) {
      if (ch.op?.i === tcText) {
        changeId = ch.id
      }
    }
  }
  ok(
    'tracked change виден в ranges (id от нашего seed)',
    !!changeId && changeId.startsWith(seed),
    `id=${changeId}`
  )
  ok('B получил tc-правку live', B.doc!.text.startsWith(tcText))

  console.log('10. Принятие правки (accept)')
  console.log(`  · changeId=${changeId} docId=${changeDocId}`)
  if (changeId && changeDocId) {
    await rest.acceptChanges(projectId, changeDocId, [changeId])
    await rest.downloadZip(projectId)
    const ranges3 = await rest.getRanges(projectId)
    const stillThere = (ranges3 as Array<{ ranges?: { changes?: RawChange[] } }>).some(
      d => d.ranges?.changes?.some(ch => ch.id === changeId)
    )
    ok('правка принята (исчезла из ranges)', !stillThere)
    ok('текст не изменился при принятии', A.doc!.text.startsWith(tcText))
  }

  console.log('11. Отклонение правки (reject: обратная операция с u-флагом)')
  const seed2 = RangesTracker.generateIdSeed()
  const origSend2 = A.doc!.onSend!
  A.doc!.onSend = update => origSend2({ ...update, meta: { tc: seed2 } } as never)
  const delTarget = 'Line one.'
  const delPos = A.doc!.text.indexOf(delTarget)
  A.doc!.localChange([{ p: delPos, d: delTarget }])
  await waitFor(() => !A.doc!.hasPending(), 'ack tracked-удаления')
  A.doc!.onSend = origSend2
  await rest.downloadZip(projectId)
  const rangesDel = await rest.getRanges(projectId)
  const delChange = (rangesDel as Array<{ ranges?: { changes?: RawChange[] } }>)
    .flatMap(d => d.ranges?.changes ?? [])
    .find(ch => (ch.op as { d?: string })?.d === delTarget)
  ok('tracked-удаление зафиксировано', !!delChange, `id=${delChange?.id}`)
  // reject: вернуть текст обычной операцией с u-флагом (без meta.tc)
  A.doc!.localChange([{ p: delPos, i: delTarget, u: true } as never])
  const rejectAcked = await waitFor(() => !A.doc!.hasPending(), 'ack reject-операции')
  ok('reject-операция подтверждена', rejectAcked)
  await rest.downloadZip(projectId)
  const rangesAfter = await rest.getRanges(projectId)
  const stillDel = (rangesAfter as Array<{ ranges?: { changes?: RawChange[] } }>)
    .flatMap(d => d.ranges?.changes ?? [])
    .some(ch => ch.id === delChange?.id)
  ok('маркер удаления снят сервером (u-флаг)', !stillDel)
  ok('текст восстановлен', A.doc!.text.includes(delTarget))
  const bSynced = await waitFor(
    () => B.doc!.text === A.doc!.text,
    'синхронизация B после reject'
  )
  ok('B в том же состоянии', bSynced)

  A.sio.close()
  B.sio.close()
  console.log(`\nИтог: ${passed} прошло, ${failed} упало`)
  console.log(`Тестовый проект: ${projectId}`)
  if (failed > 0) process.exit(1)
  process.exit(0)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})

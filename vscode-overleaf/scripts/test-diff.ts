/** Юнит-проверка diffReplaceOps: применимость и «естественность» правок. */
import { applyOp, diffReplaceOps, TextOp } from '../src/realtime/textOt'
import { aggregateChanges } from '../src/changes/aggregate'
import type { TrackedChange } from '../src/vendor/rangesTracker'

let failed = 0
function check(name: string, a: string, b: string, maxComps?: number): void {
  const op = diffReplaceOps(a, b, 0)
  let result: string
  try {
    result = applyOp(a, op)
  } catch (err) {
    console.error(`  ✗ ${name}: применение упало: ${err}`)
    failed++
    return
  }
  const okApply = result === b
  const okSize = maxComps === undefined || op.length <= maxComps
  if (okApply && okSize) {
    console.log(`  ✓ ${name} (${op.length} комп.): ${JSON.stringify(op).slice(0, 120)}`)
  } else {
    failed++
    console.error(
      `  ✗ ${name}: apply=${okApply} comps=${op.length}${maxComps !== undefined ? `>${maxComps}` : ''}\n    ${JSON.stringify(op)}`
    )
  }
}

// замена одного слова в предложении — должен быть точечный diff
check(
  'одно слово в предложении',
  'The quick brown fox jumps over the lazy dog.',
  'The quick red fox jumps over the lazy dog.',
  2
)
// вставка поверх выделения с общими краями
check(
  'paste поверх выделения (общие края)',
  'Пусть $x$ — произвольная точка множества $A$.',
  'Пусть $y$ — произвольная точка компакта $A$.',
  4
)
// перестановка/правка в середине формулы
check('замена аргументов', '\\frac{a+b}{c}', '\\frac{a+d}{c}', 2)
// полный рерайт — честные d+i, не рваный шум
check(
  'полный рерайт абзаца',
  'Совершенно один текст ни о чём.',
  'Абсолютно другой набор слов здесь.',
  4
)
// многострочная замена куска
check(
  'многострочная правка',
  'line one\nline two\nline three\nline four\n',
  'line one\nline 2!\nline three\nline four\n',
  2
)
// пустые крайние случаи
check('вставка в пустоту', '', 'новый текст', 1)
check('полное удаление', 'старый текст', '', 1)
check('без изменений', 'same', 'same', 0)
// объединение близких изменений (мелкий общий кусок растворяется)
{
  const op: TextOp = diffReplaceOps('aaa X b Y ccc', 'aaa P b Q ccc', 0, 3)
  const applied = applyOp('aaa X b Y ccc', op)
  const merged = op.length <= 2
  console.log(
    `  ${applied === 'aaa P b Q ccc' && merged ? '✓' : '✗'} слияние близких правок (mergeGap): ${op.length} комп. ${JSON.stringify(op)}`
  )
  if (applied !== 'aaa P b Q ccc' || !merged) failed++
}

// большой текст (ИИ переписал файл): пословный DP не влезает,
// должен сработать построчный уровень с пословным уточнением
{
  const lines: string[] = []
  for (let i = 0; i < 3000; i++) lines.push(`Строка номер ${i} с некоторым содержимым для объёма.`)
  const a = lines.join('\n')
  const bLines = lines.slice()
  bLines[100] = 'Строка номер 100 с изменённым содержимым для объёма.'
  bLines[2000] = 'Совсем другая строка две тысячи.'
  bLines.splice(1500, 0, 'Новая вставленная строка.')
  const b = bLines.join('\n')
  const op = diffReplaceOps(a, b, 0)
  const ok = applyOp(a, op) === b && op.length <= 8
  console.log(
    `  ${ok ? '✓' : '✗'} большой файл, точечные правки (построчный уровень): ${op.length} комп.`
  )
  if (!ok) failed++
}

// --- агрегация «замен» (правило из веба: can-aggregate.ts) ---
function tc(
  id: string,
  op: { p: number; i?: string; d?: string },
  user = 'u1'
): TrackedChange {
  return { id, op, metadata: { user_id: user } }
}
{
  // вставка + удаление ровно в конце вставки, тот же автор → замена
  const out = aggregateChanges([tc('a', { p: 10, i: 'новый' }), tc('b', { p: 15, d: 'старый' })])
  const ok =
    out.length === 1 &&
    out[0].kind === 'replace' &&
    out[0].ids.join(',') === 'a,b'
  console.log(`  ${ok ? '✓' : '✗'} агрегация в «замену»: ${JSON.stringify(out.map(o => o.kind))}`)
  if (!ok) failed++
}
{
  // разные авторы → не агрегируется
  const out = aggregateChanges([
    tc('a', { p: 10, i: 'новый' }, 'u1'),
    tc('b', { p: 15, d: 'старый' }, 'u2'),
  ])
  const ok = out.length === 2 && out[0].kind === 'insert' && out[1].kind === 'delete'
  console.log(`  ${ok ? '✓' : '✗'} разные авторы — раздельно`)
  if (!ok) failed++
}
{
  // удаление не в конце вставки → не агрегируется
  const out = aggregateChanges([tc('a', { p: 10, i: 'новый' }), tc('b', { p: 20, d: 'старый' })])
  const ok = out.length === 2
  console.log(`  ${ok ? '✓' : '✗'} разрыв позиций — раздельно`)
  if (!ok) failed++
}
{
  // цепочка: замена + одиночная вставка
  const out = aggregateChanges([
    tc('a', { p: 0, i: 'ab' }),
    tc('b', { p: 2, d: 'xy' }),
    tc('c', { p: 30, i: 'zzz' }),
  ])
  const ok =
    out.length === 2 && out[0].kind === 'replace' && out[1].kind === 'insert'
  console.log(`  ${ok ? '✓' : '✗'} замена + отдельная вставка`)
  if (!ok) failed++
}

console.log(failed ? `\n${failed} упало` : '\nвсе проверки прошли')
process.exit(failed ? 1 : 0)

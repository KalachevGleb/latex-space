/** Юнит-проверка diffReplaceOps: применимость и «естественность» правок. */
import { applyOp, diffReplaceOps, TextOp } from '../src/realtime/textOt'

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

console.log(failed ? `\n${failed} упало` : '\nвсе проверки прошли')
process.exit(failed ? 1 : 0)

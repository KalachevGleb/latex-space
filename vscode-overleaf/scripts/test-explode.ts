/**
 * Юнит-проверка explodeTex: безопасность преобразования и маппинг позиций.
 * CLI-режим: `node out/test-explode.js in.tex out.tex` — развернуть файл
 * (для сравнения реальной компиляции).
 */
import * as fs from 'fs'
import { explodeTex } from '../src/latex/explode'

if (process.argv[2] && process.argv[3]) {
  const src = fs.readFileSync(process.argv[2], 'utf8')
  fs.writeFileSync(process.argv[3], explodeTex(src).text)
  console.log('exploded ok')
  process.exit(0)
}

let failed = 0
function check(name: string, cond: boolean, extra = ''): void {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failed++
    console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`)
  }
}

const doc = (body: string) =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`

const blankLines = (s: string) => (s.match(/\n[ \t]*\n/g) ?? []).length

{
  const ex = explodeTex(doc('Hello brave new world'))
  check(
    'слова разнесены по строкам',
    ex.text.includes('Hello\nbrave\nnew\nworld'),
    ex.text
  )
  check('пустые строки не появились', blankLines(ex.text) === blankLines(doc('Hello brave new world')))
}

{
  // хвостовые пробелы и отступы не трогаем (иначе возник бы \par)
  const src = doc('alpha  \n   beta')
  const ex = explodeTex(src)
  check('пробелы у переносов не тронуты', ex.text === src, ex.text)
}

{
  const ex = explodeTex(doc('pre \\textbf{bold text here} post'))
  check('внутри групп {…} не дробим', ex.text.includes('{bold text here}'))
  check('вокруг группы дробим', ex.text.includes('pre\n\\textbf'))
}

{
  const ex = explodeTex(doc('$a b$ and \\(x y\\) also \\[z w\\] end'))
  check('внутри $…$ не дробим', ex.text.includes('$a b$'))
  check('внутри \\(…\\) не дробим', ex.text.includes('\\(x y\\)'))
  check('внутри \\[…\\] не дробим', ex.text.includes('\\[z w\\]'))
  check('между блоками дробим', ex.text.includes('$a b$\nand'))
}

{
  const ex = explodeTex(
    doc('\\begin{equation}\n  a b c\n\\end{equation}\nafter words here')
  )
  check('в не-белом окружении (equation) не дробим', ex.text.includes('  a b c'))
  check('после окружения дробим', ex.text.includes('after\nwords\nhere'))
}

{
  const body =
    '\\begin{verbatim}\n{ % $ a b unbalanced\n\\end{verbatim}\ntail words here'
  const ex = explodeTex(doc(body))
  check(
    'verbatim не тронут',
    ex.text.includes('{ % $ a b unbalanced')
  )
  check(
    'состояние после verbatim не испорчено (дробим дальше)',
    ex.text.includes('tail\nwords\nhere')
  )
}

{
  const ex = explodeTex(doc('a \\verb|x y{| b c'))
  check('\\verb не тронут', ex.text.includes('\\verb|x y{|'))
  check('после \\verb дробим', ex.text.includes('b\nc'))
}

{
  const ex = explodeTex(doc('word % a b c\nnext one'))
  check('комментарий не тронут', ex.text.includes('% a b c'))
  check('после комментария дробим', ex.text.includes('next\none'))
}

{
  const ex = explodeTex(doc('100\\% sure thing and A\\ B C'))
  check('\\% не ломает разбор', ex.text.includes('sure\nthing'))
  check('control space «\\ » не тронут', ex.text.includes('A\\ B\nC'))
}

{
  const ex = explodeTex(
    doc('\\begin{itemize}\n\\item one two\n\\end{itemize}')
  )
  check('внутри itemize (белый список) дробим', ex.text.includes('one\ntwo'))
}

{
  const src = '\\documentclass{article} \\usepackage{amsmath}\n' + doc('x')
  const ex = explodeTex(src)
  check(
    'преамбула: дробим между командами',
    ex.text.includes('\\documentclass{article}\n\\usepackage{amsmath}')
  )
}

{
  // маппинг: смещения и строки/колонки в обе стороны
  const src = doc('alpha beta gamma delta')
  const ex = explodeTex(src)
  const off = src.indexOf('gamma')
  const n = ex.origToNew(off)
  check('origToNew попадает в слово', ex.text.slice(n, n + 5) === 'gamma')
  check('newToOrig обратен', ex.newToOrig(n) === off)
  const mapped = ex.newLineCol(3, 'alpha beta '.length) // строка 3 исходника
  const newLines = ex.text.split('\n')
  check(
    'newLineCol указывает на слово',
    newLines[mapped.line1 - 1].slice(mapped.col0).startsWith('gamma'),
    JSON.stringify(mapped)
  )
  const back = ex.origLineCol(mapped.line1, mapped.col0)
  check(
    'origLineCol обратен',
    back.line1 === 3 && back.col0 === 'alpha beta '.length,
    JSON.stringify(back)
  )
}

{
  const src = doc('one two three')
  const once = explodeTex(src)
  const twice = explodeTex(once.text)
  check('идемпотентность', twice.text === once.text)
}

console.log(failed ? `\n${failed} упало` : '\nвсе проверки прошли')
process.exit(failed ? 1 : 0)

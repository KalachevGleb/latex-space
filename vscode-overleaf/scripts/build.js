/* Сборка расширения: esbuild-бандл + копирование pdf.js в media/pdfjs */
const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const watch = process.argv.includes('--watch')

function copyPdfJs() {
  const srcDir = path.join(root, 'node_modules', 'pdfjs-dist', 'build')
  const destDir = path.join(root, 'media', 'pdfjs')
  fs.mkdirSync(destDir, { recursive: true })
  for (const f of ['pdf.min.js', 'pdf.worker.min.js']) {
    fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f))
  }
  console.log('pdf.js copied to media/pdfjs')
}

async function main() {
  copyPdfJs()
  const ctx = await esbuild.context({
    entryPoints: [path.join(root, 'src', 'extension.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: path.join(root, 'out', 'extension.js'),
    external: ['vscode'],
    sourcemap: true,
    logLevel: 'info',
  })
  if (watch) {
    await ctx.watch()
    console.log('watching…')
  } else {
    await ctx.rebuild()
    await ctx.dispose()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

import * as child_process from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as esbuild from 'esbuild'
import typoraPlugin, { closeTypora, installDevPlugin } from 'esbuild-plugin-typora'
import { sassPlugin } from 'esbuild-sass-plugin'

const args = process.argv.slice(2)
const isProd = args.includes('--prod')
const isDev = !isProd

await fs.rm('./dist', { recursive: true, force: true })

await esbuild.build({
  entryPoints: ['src/main.ts'],
  outdir: 'dist',
  format: 'esm',
  bundle: true,
  minify: isProd,
  sourcemap: isDev,
  plugins: [
    typoraPlugin({
      mode: isProd ? 'production' : 'development',
    }),
    sassPlugin(),
  ],
})

const cssPath = './dist/main.css'
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    await fs.access(cssPath)
    break
  }
  catch {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

try {
  await fs.copyFile(cssPath, './dist/style.css')
  await fs.rm(cssPath, { force: true })
}
catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
    throw error
  }
}

await fs.copyFile('./src/manifest.json', './dist/manifest.json')

if (isDev) {
  try {
    await installDevPlugin()
    await closeTypora()
    child_process.exec('Typora ./test/vault/doc.md')
  }
  catch (error) {
    console.warn('Skipping Typora launch:', error instanceof Error ? error.message : String(error))
  }
}

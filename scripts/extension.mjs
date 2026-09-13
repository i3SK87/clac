/**
 * Compila la extensión del navegador en `extension/dist`, que es la carpeta que
 * se carga en opera://extensions (y la que viaja dentro del instalador).
 *
 *   npm run extension
 *
 * - El código, con esbuild, desde `extension/src` y lo compartido de `src/shared`.
 * - La hoja de estilos: las paletas y la base de la casa, y encima la suya.
 * - Los iconos de la barra, con la regla de la casa (`casa/marca`).
 * - Los dibujos de Lucide que usa la ventana, pasados a SVG aquí, para no meter
 *   React en una extensión que no lo necesita.
 */
import { build } from 'esbuild'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dibujar, png } from 'casa/marca'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origen = join(raiz, 'extension')
const destino = join(origen, 'dist')
const requerir = createRequire(import.meta.url)

// — Los iconos de Lucide, a texto —
const { createElement } = requerir('react')
const { renderToStaticMarkup } = requerir('react-dom/server')
const lucide = requerir('lucide-react')
const USADOS = {
  lock: 'Lock',
  unlock: 'LockOpen',
  unplug: 'Unplug',
  external: 'ExternalLink',
  save: 'Save',
  wand: 'WandSparkles',
  user: 'User',
  key: 'KeyRound',
  clock: 'Clock',
  alert: 'TriangleAlert',
  copy: 'Copy',
  refresh: 'RefreshCw',
  hello: 'ScanFace'
}
const iconos = Object.fromEntries(
  Object.entries(USADOS).map(([clave, nombre]) => [clave, renderToStaticMarkup(createElement(lucide[nombre], { strokeWidth: 1.8 }))])
)
writeFileSync(
  join(origen, 'src', 'iconos.gen.ts'),
  `// Generado por scripts/extension.mjs a partir de lucide-react. No se edita a mano.\nexport const ICONOS = ${JSON.stringify(iconos, null, 2)} as const\n`
)

rmSync(destino, { recursive: true, force: true })
mkdirSync(join(destino, 'iconos'), { recursive: true })

// — El código —
await build({
  entryPoints: [join(origen, 'src', 'popup.ts')],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outfile: join(destino, 'popup.js'),
  alias: { '@shared': join(raiz, 'src', 'shared') },
  // Sin minificar: las funciones que se inyectan en la página viajan como texto,
  // y así se pueden leer tal cual en las herramientas de desarrollo.
  minify: false,
  legalComments: 'none'
})

// — La hoja: la casa y lo suyo —
const casa = join(raiz, 'node_modules', 'casa')
writeFileSync(
  join(destino, 'popup.css'),
  [
    readFileSync(join(casa, 'estilos', 'paletas.css'), 'utf8'),
    readFileSync(join(casa, 'estilos', 'base.css'), 'utf8'),
    readFileSync(join(origen, 'popup.css'), 'utf8')
  ].join('\n')
)

// — Lo que va tal cual —
copyFileSync(join(origen, 'manifest.json'), join(destino, 'manifest.json'))
copyFileSync(join(origen, 'popup.html'), join(destino, 'popup.html'))

// — Los iconos de la barra —
for (const lado of [16, 32, 48, 128]) {
  writeFileSync(join(destino, 'iconos', `${lado}.png`), png(dibujar('clac', lado), lado))
}

const version = JSON.parse(readFileSync(join(origen, 'manifest.json'), 'utf8')).version
console.log(`Extensión ${version} compilada en ${destino}`)

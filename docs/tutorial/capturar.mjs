// Rehace todas las capturas del tutorial, una por proceso (ver retratar.cjs).
//
//   npm run capturas   (compila antes con npm run build)
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const electron = createRequire(import.meta.url)('electron')
// Las escenas están en retratar.cjs; aquí solo se llaman por su prefijo.
const PREFIJOS = ['t01', 't02', 't03', 't04', 't05', 't06', 't07', 't08', 't09', 't10', 't11', 't12', 't13', 't14', 'p01', 'p02', 'p03', 'p04']
for (const escena of PREFIJOS) {
  const r = spawnSync(electron, [join(aqui, 'retratar.cjs'), `--escena=${escena}`], { encoding: 'utf8', timeout: 60_000 })
  const linea = (r.stdout || '').split('\n').find((l) => l.startsWith(escena)) ?? `${escena}: sin respuesta`
  console.log(linea)
}

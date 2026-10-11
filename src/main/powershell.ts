/**
 * Arrancar un PowerShell con un guion largo.
 *
 * Hasta la 1.6.1 el guion iba entero en la línea de órdenes, con
 * `-EncodedCommand`. En base64 y UTF-16 ocupa casi tres veces lo que el texto,
 * y Windows no admite líneas de más de 32.767 caracteres: con el auto-tecleo
 * de la 1.6.0, el del ayudante pasó de ahí y dejó de arrancar (`spawn
 * ENAMETOOLONG`), sin que se notara más que en el registro.
 *
 * Ahora la línea solo lleva un arranque corto, y el guion va en una variable
 * de entorno que ese arranque lee, borra y ejecuta. Una variable admite los
 * mismos 32.767, pero de texto llano.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

const VARIABLE = 'CLAC_GUION'
const MAXIMO = 32_000

const ARRANQUE = Buffer.from(
  `$g = $env:${VARIABLE}; Remove-Item Env:${VARIABLE}; Invoke-Expression $g`,
  'utf16le'
).toString('base64')

export function lanzarPowerShell(
  guion: string,
  opciones: string[],
  env: Record<string, string> = {}
): ChildProcessWithoutNullStreams {
  if (guion.length > MAXIMO) throw new Error(`El guion de PowerShell es demasiado largo (${guion.length} caracteres).`)
  return spawn(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', ...opciones, '-ExecutionPolicy', 'Bypass', '-EncodedCommand', ARRANQUE],
    { windowsHide: true, env: { ...process.env, ...env, [VARIABLE]: guion } }
  )
}

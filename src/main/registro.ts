/**
 * El cuaderno de bitácora: lo que pasa por dentro, a un archivo.
 *
 * Electron en Windows no tiene consola, así que un `console.log` se pierde. Esto
 * escribe en `registro.txt`, junto a los datos, y se recorta solo cuando pasa de
 * medio mega. Nunca se apunta nada de dentro de la caja fuerte: ni títulos, ni
 * usuarios, ni webs. Solo qué ha pasado.
 */
import { app } from 'electron'
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TOPE = 512 * 1024

function ruta(): string {
  return join(app.getPath('userData'), 'registro.txt')
}

export function registrar(donde: string, que: string): void {
  try {
    const archivo = ruta()
    if (existsSync(archivo) && statSync(archivo).size > TOPE) {
      // Se queda con la mitad más reciente.
      const texto = readFileSync(archivo, 'utf8')
      writeFileSync(archivo, texto.slice(texto.length / 2))
    }
    appendFileSync(archivo, `${new Date().toISOString()}  [${donde}] ${que}\n`)
  } catch {
    // Sin registro se vive: lo que no puede pasar es que apuntar algo tumbe la aplicación.
  }
}

export function registrarFallo(donde: string, error: unknown): void {
  registrar(donde, `FALLO: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
}

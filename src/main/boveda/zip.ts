/**
 * Lo justo para leer un .zip: el .1pux de 1Password es un zip con un JSON
 * dentro (`export.data`) y los archivos adjuntos en la carpeta `files/`.
 *
 * Node trae zlib pero no sabe de zips, y para esto no merece la pena una
 * dependencia: se lee el directorio central del final del archivo, que dice
 * dónde empieza cada entrada, y cada una se descomprime con `inflateRaw`.
 * Solo se admiten las dos formas de guardar que usa todo el mundo: sin
 * comprimir (0) y deflate (8). ZIP64, para archivos de más de 4 GB, no.
 */
import { inflateRawSync } from 'node:zlib'

export interface EntradaZip {
  nombre: string
  leer: () => Buffer
}

const FIRMA_FIN = 0x06054b50
const FIRMA_CENTRAL = 0x02014b50
const FIRMA_LOCAL = 0x04034b50

export function leerZip(zip: Buffer): Map<string, EntradaZip> {
  // El registro del final está en los últimos 22 bytes, más un comentario de hasta 64 KB.
  let fin = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (zip.readUInt32LE(i) === FIRMA_FIN) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new Error('El archivo no es un .zip válido.')

  const total = zip.readUInt16LE(fin + 10)
  let p = zip.readUInt32LE(fin + 16)
  const entradas = new Map<string, EntradaZip>()

  for (let n = 0; n < total; n++) {
    if (zip.readUInt32LE(p) !== FIRMA_CENTRAL) throw new Error('El .zip está dañado.')
    const metodo = zip.readUInt16LE(p + 10)
    const comprimido = zip.readUInt32LE(p + 20)
    const largoNombre = zip.readUInt16LE(p + 28)
    const largoExtra = zip.readUInt16LE(p + 30)
    const largoComentario = zip.readUInt16LE(p + 32)
    const local = zip.readUInt32LE(p + 42)
    const nombre = zip.subarray(p + 46, p + 46 + largoNombre).toString('utf8')
    p += 46 + largoNombre + largoExtra + largoComentario

    if (nombre.endsWith('/')) continue
    entradas.set(nombre, {
      nombre,
      leer: () => {
        if (zip.readUInt32LE(local) !== FIRMA_LOCAL) throw new Error(`El .zip está dañado en «${nombre}».`)
        const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
        const datos = zip.subarray(inicio, inicio + comprimido)
        if (metodo === 0) return Buffer.from(datos)
        if (metodo === 8) return inflateRawSync(datos)
        throw new Error(`«${nombre}» está comprimido de una forma que no se admite (${metodo}).`)
      }
    })
  }
  return entradas
}

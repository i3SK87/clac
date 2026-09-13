/**
 * Dónde vive la clave secreta en este equipo.
 *
 * En un archivo al lado de la caja fuerte, cifrada con `safeStorage`, que en
 * Windows es DPAPI: la cifra la propia cuenta de usuario de Windows. Copiar ese
 * archivo a otro ordenador, o leerlo desde otra cuenta, no sirve de nada.
 *
 * Esto es lo que hace que una copia de la caja fuerte que acabe en una memoria
 * USB, en la nube o en manos de alguien no se pueda atacar: ahí va la caja,
 * pero no la clave, que se queda aquí y en el kit de emergencia.
 */
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatearClave, leerClave, type ClaveSecreta } from '@shared/claveSecreta'

function ruta(): string {
  return join(app.getPath('userData'), 'clave-secreta.bin')
}

export function guardarClaveLocal(clave: ClaveSecreta): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows no deja cifrar la clave secreta en este equipo.')
  }
  writeFileSync(ruta(), safeStorage.encryptString(formatearClave(clave)))
}

/** La clave de este equipo, si está y es de la cuenta que se pide. */
export function leerClaveLocal(idCuenta: string | null): ClaveSecreta | null {
  const archivo = ruta()
  if (!existsSync(archivo) || !idCuenta) return null
  try {
    const leida = leerClave(safeStorage.decryptString(readFileSync(archivo)))
    if ('error' in leida || leida.clave.idCuenta !== idCuenta) return null
    return leida.clave
  } catch {
    // De otra cuenta de Windows, o dañada: como si no estuviera.
    return null
  }
}

export function borrarClaveLocal(): void {
  rmSync(ruta(), { force: true })
}

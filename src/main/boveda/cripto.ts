/**
 * El cifrado, entero, con lo que trae Node. Ni una librería de fuera.
 *
 * La cadena es la de 1Password, con una pieza cambiada:
 *
 *   contraseña ──scrypt──┐
 *                        ├─ XOR ─→ clave de desbloqueo (AUK)
 *   clave secreta ─HKDF──┘               │ abre
 *                                        ▼
 *                              clave de la cuenta (256 bits al azar)
 *                                        │ abre
 *                                        ▼
 *                          clave de cada caja fuerte (256 bits al azar)
 *                                        │ cifra
 *                                        ▼
 *                         resumen y detalle de cada elemento
 *
 * La pieza cambiada es la del estiramiento. 1Password usa PBKDF2 con 650.000
 * vueltas porque tiene que correr igual en un navegador; aquí se usa **scrypt**
 * con N = 2¹⁷, que obliga a gastar 128 MB de memoria por intento. Eso es lo
 * que encarece de verdad un ataque con tarjetas gráficas: tienen potencia de
 * sobra pero poca memoria por núcleo. Argon2id habría sido lo ideal, pero el
 * motor de Electron está construido con BoringSSL y no lo trae (comprobado el
 * 13/09/2026); scrypt sí, y es igual de estándar (RFC 7914).
 *
 * Y el cifrado de todo lo demás es AES-256-GCM, que además de cifrar detecta
 * cualquier cambio: un bit tocado en el archivo y no se abre. Cada sobre lleva
 * pegado su «contexto» —«elemento:<id>:detalle»— como dato autenticado, así que
 * tampoco se puede coger el sobre de un elemento y colocarlo en la fila de otro.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scryptSync } from 'node:crypto'

export interface ParametrosKdf {
  alg: 'scrypt'
  N: number
  r: number
  p: number
  /** 16 bytes al azar, en base64. */
  sal: string
}

/**
 * N = 2¹⁷, r = 8: 128 MB y unos 300 ms por intento en este equipo, dentro de
 * Electron. Es la recomendación de OWASP para scrypt. Viaja guardado junto a la
 * caja fuerte, así que subirlo algún día no rompe las que ya existen.
 */
export const KDF_POR_DEFECTO = { alg: 'scrypt' as const, N: 2 ** 17, r: 8, p: 1 }

const VERSION_SOBRE = 1
const LARGO_NONCE = 12
const LARGO_ETIQUETA = 16

export class ErrorDescifrado extends Error {
  constructor(contexto: string) {
    super(`No se pudo descifrar (${contexto})`)
    this.name = 'ErrorDescifrado'
  }
}

export function aleatorio(bytes: number): Buffer {
  return randomBytes(bytes)
}

export function nuevaSal(): string {
  return aleatorio(16).toString('base64')
}

/**
 * La contraseña tal y como se estira: sin espacios en los extremos y en la
 * forma Unicode NFKD, para que «ñ» dé lo mismo escrita de una sola pieza o
 * como «n» más la tilde, que según el teclado sale de una forma o de otra.
 */
export function prepararContrasena(contrasena: string): Buffer {
  return Buffer.from(contrasena.trim().normalize('NFKD'), 'utf8')
}

/** Las dos llaves juntas: la contraseña estirada y la clave secreta, mezcladas. */
export function derivarClaveDesbloqueo(
  contrasena: string,
  secreto: string,
  idCuenta: string,
  kdf: ParametrosKdf
): Buffer {
  if (kdf.alg !== 'scrypt') throw new Error(`Algoritmo de derivación desconocido: ${kdf.alg}`)
  // La sal se pasa por HKDF con el identificador de la cuenta, como hace
  // 1Password con el correo: dos cuentas con la misma sal seguirían saliendo
  // distintas.
  const sal = Buffer.from(hkdfSync('sha256', Buffer.from(kdf.sal, 'base64'), idCuenta, 'CLAC-1 scrypt', 32))
  const estirada = scryptSync(prepararContrasena(contrasena), sal, 32, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: 256 * kdf.N * kdf.r + 32 * 1024 * 1024
  })
  const deLaClave = Buffer.from(hkdfSync('sha256', Buffer.from(secreto, 'ascii'), idCuenta, 'CLAC-1 clave secreta', 32))
  const auk = Buffer.alloc(32)
  for (let i = 0; i < 32; i++) auk[i] = estirada[i] ^ deLaClave[i]
  estirada.fill(0)
  deLaClave.fill(0)
  return auk
}

/** Cifra y cierra el sobre: [versión][nonce de 12][cifrado][etiqueta de 16]. */
export function sellar(clave: Buffer, datos: Buffer | string, contexto: string): Buffer {
  const nonce = aleatorio(LARGO_NONCE)
  const cifrador = createCipheriv('aes-256-gcm', clave, nonce)
  cifrador.setAAD(Buffer.from(contexto, 'utf8'))
  const cuerpo = Buffer.concat([cifrador.update(typeof datos === 'string' ? Buffer.from(datos, 'utf8') : datos), cifrador.final()])
  return Buffer.concat([Buffer.from([VERSION_SOBRE]), nonce, cuerpo, cifrador.getAuthTag()])
}

/** Abre un sobre. Si la clave no es la suya, o el sobre se ha tocado, falla. */
export function abrir(clave: Buffer, sobre: Uint8Array, contexto: string): Buffer {
  const b = Buffer.from(sobre)
  if (b.length < 1 + LARGO_NONCE + LARGO_ETIQUETA || b[0] !== VERSION_SOBRE) throw new ErrorDescifrado(contexto)
  const nonce = b.subarray(1, 1 + LARGO_NONCE)
  const etiqueta = b.subarray(b.length - LARGO_ETIQUETA)
  const cuerpo = b.subarray(1 + LARGO_NONCE, b.length - LARGO_ETIQUETA)
  try {
    const descifrador = createDecipheriv('aes-256-gcm', clave, nonce)
    descifrador.setAAD(Buffer.from(contexto, 'utf8'))
    descifrador.setAuthTag(etiqueta)
    return Buffer.concat([descifrador.update(cuerpo), descifrador.final()])
  } catch {
    throw new ErrorDescifrado(contexto)
  }
}

export function sellarJson(clave: Buffer, valor: unknown, contexto: string): Buffer {
  return sellar(clave, JSON.stringify(valor), contexto)
}

export function abrirJson<T>(clave: Buffer, sobre: Uint8Array, contexto: string): T {
  return JSON.parse(abrir(clave, sobre, contexto).toString('utf8')) as T
}

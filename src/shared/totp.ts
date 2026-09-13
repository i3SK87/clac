/**
 * Códigos de un solo uso (TOTP, RFC 6238), los de Google Authenticator.
 *
 * Un código es un HMAC del número de medios minutos pasados desde 1970, con el
 * secreto que dio la web al activar la verificación en dos pasos, recortado a
 * seis cifras. No hace falta ninguna librería: el HMAC lo trae
 * `crypto.subtle`, igual en la ventana que en Node.
 *
 * El secreto se puede pegar de dos maneras: la dirección `otpauth://` entera,
 * que es lo que lleva dentro el código QR, o solo el secreto en base32, que es
 * lo que enseñan las webs debajo del QR como «¿no puedes escanearlo?».
 */

export type AlgoritmoTotp = 'SHA-1' | 'SHA-256' | 'SHA-512'

export interface ConfigTotp {
  secreto: Uint8Array
  algoritmo: AlgoritmoTotp
  digitos: number
  periodo: number
  emisor: string
  cuenta: string
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32ABytes(texto: string): Uint8Array | null {
  const limpio = texto.toUpperCase().replace(/[\s=-]/g, '')
  if (!limpio || /[^A-Z2-7]/.test(limpio)) return null
  const bytes: number[] = []
  let acumulado = 0
  let bits = 0
  for (const ch of limpio) {
    acumulado = (acumulado << 5) | BASE32.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((acumulado >> bits) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

export function bytesABase32(bytes: Uint8Array): string {
  let salida = ''
  let acumulado = 0
  let bits = 0
  for (const b of bytes) {
    acumulado = (acumulado << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      salida += BASE32[(acumulado >> bits) & 31]
    }
  }
  if (bits > 0) salida += BASE32[(acumulado << (5 - bits)) & 31]
  return salida
}

function algoritmoDe(texto: string | null): AlgoritmoTotp {
  const t = (texto ?? '').toUpperCase().replace('-', '')
  if (t === 'SHA256') return 'SHA-256'
  if (t === 'SHA512') return 'SHA-512'
  return 'SHA-1'
}

/** Lee lo que se haya pegado en el campo. `null` si no hay forma de sacar un secreto. */
export function leerTotp(valor: string): ConfigTotp | null {
  const texto = valor.trim()
  if (!texto) return null

  if (/^otpauth:\/\//i.test(texto)) {
    let url: URL
    try {
      url = new URL(texto)
    } catch {
      return null
    }
    if (url.hostname.toLowerCase() !== 'totp') return null
    const secreto = base32ABytes(url.searchParams.get('secret') ?? '')
    if (!secreto || secreto.length === 0) return null
    const etiqueta = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const [emisorEtiqueta, cuenta] = etiqueta.includes(':') ? etiqueta.split(/:(.*)/s) : ['', etiqueta]
    const digitos = Number(url.searchParams.get('digits') ?? 6)
    const periodo = Number(url.searchParams.get('period') ?? 30)
    return {
      secreto,
      algoritmo: algoritmoDe(url.searchParams.get('algorithm')),
      digitos: digitos >= 6 && digitos <= 8 ? digitos : 6,
      periodo: periodo > 0 && periodo <= 300 ? periodo : 30,
      emisor: url.searchParams.get('issuer') ?? emisorEtiqueta.trim(),
      cuenta: (cuenta ?? '').trim()
    }
  }

  /*
   * Suelto, se exige un mínimo de 16 signos (80 bits), que es lo más corto que
   * dan las webs. Sin ese mínimo, cualquier palabra en mayúsculas —«ESTONOES»—
   * es base32 válido y pasaría por un secreto.
   */
  if (texto.replace(/[\s=-]/g, '').length < 16) return null
  const secreto = base32ABytes(texto)
  if (!secreto) return null
  return { secreto, algoritmo: 'SHA-1', digitos: 6, periodo: 30, emisor: '', cuenta: '' }
}

/** El código HOTP para un contador dado (RFC 4226). */
export async function hotp(config: Pick<ConfigTotp, 'secreto' | 'algoritmo' | 'digitos'>, contador: number): Promise<string> {
  const mensaje = new Uint8Array(8)
  let resto = contador
  for (let i = 7; i >= 0; i--) {
    mensaje[i] = resto & 0xff
    resto = Math.floor(resto / 256)
  }
  const clave = await globalThis.crypto.subtle.importKey(
    'raw',
    config.secreto as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: config.algoritmo },
    false,
    ['sign']
  )
  const firma = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', clave, mensaje))
  const desplazamiento = firma[firma.length - 1] & 0x0f
  const numero =
    ((firma[desplazamiento] & 0x7f) << 24) |
    (firma[desplazamiento + 1] << 16) |
    (firma[desplazamiento + 2] << 8) |
    firma[desplazamiento + 3]
  return String(numero % 10 ** config.digitos).padStart(config.digitos, '0')
}

export async function codigoTotp(config: ConfigTotp, ahora = Date.now()): Promise<string> {
  return hotp(config, Math.floor(ahora / 1000 / config.periodo))
}

export function segundosRestantes(config: Pick<ConfigTotp, 'periodo'>, ahora = Date.now()): number {
  const segundos = Math.floor(ahora / 1000)
  return config.periodo - (segundos % config.periodo)
}

/** «123 456», que se lee y se dicta mejor que seis cifras pegadas. */
export function formatearCodigo(codigo: string): string {
  if (codigo.length === 6) return `${codigo.slice(0, 3)} ${codigo.slice(3)}`
  if (codigo.length === 8) return `${codigo.slice(0, 4)} ${codigo.slice(4)}`
  return codigo
}

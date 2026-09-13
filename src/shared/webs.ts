/**
 * Las direcciones web de los elementos: cómo se abren, cómo se comparan y de
 * qué color es el avatar de cada una.
 *
 * Los iconos de las webs no se descargan. 1Password los pide a su servidor, y
 * eso es decirle a alguien qué webs tienes guardadas; aquí el avatar es la
 * inicial sobre un color que sale del propio dominio, así que la misma web
 * tiene siempre el mismo color sin preguntar nada a nadie.
 */

/** Con el esquema puesto, lista para abrir en el navegador. `null` si no es una web. */
export function normalizarWeb(texto: string): string | null {
  const limpio = texto.trim()
  if (!limpio) return null
  const conEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(limpio) ? limpio : `https://${limpio}`
  try {
    const url = new URL(conEsquema)
    // Solo lo que abre un navegador: nada de file:, javascript: ni similares.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null
    return url.toString()
  } catch {
    return null
  }
}

/** «accounts.google.com», sin el «www.». Vacío si no se entiende. */
export function dominioDe(texto: string): string {
  const url = normalizarWeb(texto)
  if (!url) return ''
  return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
}

/**
 * Los sufijos de dos piezas más comunes: en «bbc.co.uk» el dominio es «bbc.co.uk»
 * y no «co.uk». La lista completa (la Public Suffix List) son diez mil líneas;
 * para las webs que se usan en España basta con estas.
 */
const SUFIJOS_DOBLES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.es', 'nom.es', 'org.es', 'gob.es', 'edu.es',
  'com.ar', 'com.mx', 'com.br', 'com.co', 'com.pe', 'com.ve', 'com.uy', 'com.au', 'co.nz',
  'co.jp', 'co.kr', 'co.in', 'co.za', 'com.tr', 'com.cn', 'com.pt', 'com.pl'
])

/**
 * El dominio que decide si una web es «la misma»: «accounts.google.com» y
 * «mail.google.com» son google.com. Es lo que usa la extensión para ofrecer los
 * elementos de la web en la que estás, y para avisar si vas a rellenar en otra.
 */
export function dominioBase(texto: string): string {
  const host = dominioDe(texto)
  if (!host) return ''
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return host
  const partes = host.split('.')
  const ultimasDos = partes.slice(-2).join('.')
  if (SUFIJOS_DOBLES.has(ultimasDos) && partes.length >= 3) return partes.slice(-3).join('.')
  return ultimasDos
}

/** Si la web va sin cifrar, que es lo que avisa Watchtower. */
export function esSinCifrar(texto: string): boolean {
  const limpio = texto.trim().toLowerCase()
  if (!limpio.startsWith('http://')) return false
  // Las del propio equipo y de la red de casa no cuentan: el router no tiene HTTPS.
  const host = dominioDe(limpio)
  return !(
    host === 'localhost' ||
    /^127\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.local')
  )
}

/**
 * Colores de avatar. Tonos medios que sostienen una letra blanca encima con
 * 4,5:1 en cualquier paleta, clara u oscura.
 */
const COLORES_AVATAR = [
  '#2f6fd6', '#1f8a5b', '#b8452e', '#7a4fb5', '#0f7f86', '#a0527a', '#8a6a12', '#3f5fa8',
  '#b33a5c', '#3b7d3a', '#6b5bd6', '#a8551f', '#246b8f', '#8f3b8a', '#5d6878', '#c0392b'
]

function hash(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function colorDe(texto: string): string {
  return COLORES_AVATAR[hash(texto.toLowerCase()) % COLORES_AVATAR.length]
}

/** La letra del avatar: la primera del título que sea letra o cifra. */
export function inicialDe(titulo: string): string {
  const ch = [...titulo.trim()].find((c) => /[\p{L}\p{N}]/u.test(c))
  return (ch ?? '?').toUpperCase()
}

/**
 * Cuánto aguanta una contraseña escrita a mano.
 *
 * Una generada sabe sus bits porque se sabe cómo se hizo. Una escrita a mano
 * no, y contar caracteres engaña: «Barcelona2024!» tiene catorce, mayúscula,
 * cifras y símbolo, y cae en segundos porque es una palabra, un año y el signo
 * de siempre. Esto no es zxcvbn, pero cobra lo que cobra un atacante de verdad:
 *
 * - Las contraseñas más usadas valen casi nada, lleven lo que lleven detrás.
 * - Una palabra conocida cuenta como una sola elección entre unas pocas miles,
 *   no como una letra al azar por cada una de las suyas.
 * - Repetir un carácter, las secuencias (abc, 123, qwerty) y los años cuestan
 *   poco.
 * - El resto, lo que de verdad parece azar, se cobra entero según el tamaño del
 *   alfabeto que usa.
 */
import { PALABRAS } from './palabras'
import { llana } from './generador'

export type Nivel = 0 | 1 | 2 | 3 | 4

export interface Fortaleza {
  nivel: Nivel
  etiqueta: string
  bits: number
}

export const ETIQUETAS_NIVEL = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente'] as const

/** Las contraseñas que más aparecen en las filtraciones, en España y fuera. */
const COMUNES = new Set([
  '123456', '123456789', '12345678', '12345', '1234567', '1234567890', '1234', '123', '111111',
  '000000', '123123', '654321', '666666', '121212', '112233', '159753', '987654321', '1q2w3e4r',
  '1qaz2wsx', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdf', 'zxcvbnm', 'abc123', 'abcd1234', 'password',
  'passw0rd', 'password1', 'contraseña', 'contrasena', 'clave', 'secreto', 'admin', 'administrador',
  'root', 'usuario', 'invitado', 'guest', 'login', 'welcome', 'bienvenido', 'iloveyou', 'teamo',
  'tequiero', 'amor', 'amorcito', 'princesa', 'princess', 'dragon', 'monkey', 'master', 'shadow',
  'sunshine', 'football', 'futbol', 'baseball', 'superman', 'batman', 'pokemon', 'naruto', 'hola',
  'holahola', 'hola123', 'barcelona', 'realmadrid', 'madrid', 'sevilla', 'valencia', 'betis',
  'atleti', 'españa', 'espana', 'mexico', 'argentina', 'colombia', 'mariposa', 'estrella',
  'corazon', 'familia', 'chocolate', 'lucas', 'daniel', 'david', 'alejandro', 'carlos', 'maria',
  'laura', 'lucia', 'martina', 'pablo', 'javier', 'sergio', 'manuel', 'antonio', 'jose', 'juan',
  'qazwsx', 'letmein', 'trustno1', 'starwars', 'whatever', 'ninja', 'michael', 'charlie', 'jordan',
  'hunter', 'killer', 'soccer', 'hello', 'freedom', 'computer', 'internet', 'samsung', 'google',
  'facebook', 'instagram', 'movistar', 'vodafone', 'orange', 'wifi', 'router'
])

/** Filas del teclado, para cazar «qwerty», «asdf» y compañía en los dos sentidos. */
const FILAS = ['1234567890', 'qwertyuiop', 'asdfghjklñ', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz']

/** Palabras de la lista del generador y de las comunes, en letra llana, de cuatro letras o más. */
const DICCIONARIO: Set<string> = new Set(
  [...PALABRAS.map((p) => llana(p)), ...[...COMUNES].filter((p) => !/\d/.test(p))].filter(
    (p) => p.length >= 4
  )
)
const COSTE_PALABRA = Math.log2(DICCIONARIO.size) + 1

function reserva(valor: string): number {
  let tam = 0
  if (/[a-z]/.test(valor)) tam += 26
  if (/[A-Z]/.test(valor)) tam += 26
  if (/\d/.test(valor)) tam += 10
  if (/[!-/:-@[-`{-~]/.test(valor)) tam += 33
  if (/[^\x00-\x7f]/.test(valor)) tam += 60
  if (/ /.test(valor)) tam += 1
  return Math.max(tam, 10)
}

function esSecuencia(a: string, b: string): boolean {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (Math.abs(x.charCodeAt(0) - y.charCodeAt(0)) === 1) return true
  return FILAS.some((fila) => {
    const i = fila.indexOf(x)
    return i >= 0 && (fila[i + 1] === y || fila[i - 1] === y)
  })
}

export function fortaleza(valor: string): Fortaleza {
  if (!valor) return { nivel: 0, etiqueta: ETIQUETAS_NIVEL[0], bits: 0 }

  const bajo = llana(valor.toLowerCase())
  // Una de las de siempre, aunque le hayan puesto un número o un signo detrás.
  const nucleo = bajo.replace(/[\d!-/:-@[-`{-~]+$/, '').replace(/^[\d!-/:-@[-`{-~]+/, '')
  if (COMUNES.has(bajo) || (nucleo.length >= 3 && COMUNES.has(nucleo) && bajo.length - nucleo.length <= 4)) {
    return clasificar(Math.min(12, valor.length * 1.5))
  }

  const porCaracter = Math.log2(reserva(valor))
  const chars = [...valor]
  const coste: number[] = chars.map(() => porCaracter)

  // Palabras del diccionario: se cobran una vez, como una sola elección.
  const cubierto = new Array<boolean>(chars.length).fill(false)
  const llanos = [...bajo]
  for (let i = 0; i < llanos.length; i++) {
    for (let largo = Math.min(10, llanos.length - i); largo >= 4; largo--) {
      const trozo = llanos.slice(i, i + largo).join('')
      if (DICCIONARIO.has(trozo)) {
        for (let k = i; k < i + largo; k++) {
          coste[k] = 0
          cubierto[k] = true
        }
        coste[i] = COSTE_PALABRA
        i += largo - 1
        break
      }
    }
  }

  // Años: 1950-2039 salen en todas partes, y valen unos 7 bits.
  for (const m of valor.matchAll(/(19[5-9]\d|20[0-3]\d)/g)) {
    const i = m.index ?? 0
    if (cubierto.slice(i, i + 4).some(Boolean)) continue
    coste[i] = 7
    coste[i + 1] = coste[i + 2] = coste[i + 3] = 0
    for (let k = i; k < i + 4; k++) cubierto[k] = true
  }

  // Repeticiones y secuencias: el que sigue a su vecino apenas suma.
  for (let i = 1; i < chars.length; i++) {
    if (cubierto[i]) continue
    if (chars[i] === chars[i - 1]) coste[i] = 1
    else if (esSecuencia(chars[i - 1], chars[i])) coste[i] = 2
  }

  return clasificar(coste.reduce((a, b) => a + b, 0))
}

function clasificar(bits: number): Fortaleza {
  const nivel: Nivel = bits < 28 ? 0 : bits < 36 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4
  return { nivel, etiqueta: ETIQUETAS_NIVEL[nivel], bits: Math.round(bits) }
}

/** Nivel de una contraseña generada, sabiendo sus bits exactos. */
export function nivelDeBits(bits: number): Fortaleza {
  return clasificar(bits)
}

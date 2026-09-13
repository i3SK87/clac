/**
 * El generador de contraseñas: aleatoria, memorable y PIN, como el de 1Password.
 *
 * Cada una dice cuántos bits de azar lleva de verdad, calculados sobre cómo se
 * ha generado y no adivinados mirando el resultado: una contraseña de cinco
 * palabras sacadas de 2.048 tiene 55 bits aunque parezca una frase tonta.
 */
import { enteroAleatorio, elegir } from './aleatorio'
import { PALABRAS } from './palabras'

export type TipoGenerador = 'aleatoria' | 'memorable' | 'pin'
export type Separador = 'guion' | 'punto' | 'espacio' | 'coma' | 'bajo' | 'numeros'

export interface OpcionesGenerador {
  tipo: TipoGenerador
  /** Aleatoria: de 8 a 64 caracteres. */
  largo: number
  numeros: boolean
  simbolos: boolean
  /** Memorable: de 3 a 10 palabras. */
  palabras: number
  separador: Separador
  mayusculas: boolean
  /** Con tildes y eñes tal cual, o pasadas a letra llana para teclados de fuera. */
  conTildes: boolean
  /** PIN: de 4 a 12 cifras. */
  digitos: number
}

export const OPCIONES_POR_DEFECTO: OpcionesGenerador = {
  tipo: 'aleatoria',
  largo: 20,
  numeros: true,
  simbolos: true,
  palabras: 5,
  separador: 'guion',
  mayusculas: true,
  conTildes: false,
  digitos: 6
}

export const LIMITES = {
  largo: [8, 64],
  palabras: [3, 10],
  digitos: [4, 12]
} as const

const MINUSCULAS = 'abcdefghijklmnopqrstuvwxyz'
const MAYUSCULAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const CIFRAS = '0123456789'
/**
 * Los símbolos que casi ninguna web rechaza. Fuera quedan las comillas, la
 * barra invertida, el espacio y los paréntesis, que son los que más formularios
 * se tragan mal.
 */
export const SIMBOLOS = '!#$%&*+-=?@^_'

const SEPARADORES: Record<Exclude<Separador, 'numeros'>, string> = {
  guion: '-',
  punto: '.',
  espacio: ' ',
  coma: ',',
  bajo: '_'
}

export interface Generada {
  valor: string
  bits: number
}

function acotar(valor: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, Math.round(valor)))
}

/** La palabra en letra llana: sin tildes y con la eñe como ene. */
export function llana(palabra: string): string {
  return palabra.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function generar(opciones: OpcionesGenerador): Generada {
  if (opciones.tipo === 'pin') return generarPin(acotar(opciones.digitos, LIMITES.digitos))
  if (opciones.tipo === 'memorable') return generarMemorable(opciones)
  return generarAleatoria(opciones)
}

function generarAleatoria(opciones: OpcionesGenerador): Generada {
  const largo = acotar(opciones.largo, LIMITES.largo)
  const clases = [MINUSCULAS, MAYUSCULAS]
  if (opciones.numeros) clases.push(CIFRAS)
  if (opciones.simbolos) clases.push(SIMBOLOS)
  const reserva = clases.join('')

  /*
   * Que salga al menos uno de cada clase pedida, que muchas webs lo exigen.
   *
   * No se fuerza metiendo uno a mano en un sitio fijo —eso haría que la cifra
   * cayera siempre en la misma posición—: se tira la contraseña entera y, si le
   * falta alguna clase, se vuelve a tirar. Con veinte caracteres pasa rarísima
   * vez, y el resultado sigue siendo uniforme entre todas las válidas.
   */
  for (;;) {
    let valor = ''
    for (let i = 0; i < largo; i++) valor += reserva[enteroAleatorio(reserva.length)]
    if (clases.every((clase) => [...valor].some((ch) => clase.includes(ch)))) {
      return { valor, bits: largo * Math.log2(reserva.length) }
    }
  }
}

function generarMemorable(opciones: OpcionesGenerador): Generada {
  const cuantas = acotar(opciones.palabras, LIMITES.palabras)
  const elegidas: string[] = []
  for (let i = 0; i < cuantas; i++) {
    let palabra = elegir(PALABRAS)
    if (!opciones.conTildes) palabra = llana(palabra)
    if (opciones.mayusculas) palabra = palabra[0].toUpperCase() + palabra.slice(1)
    elegidas.push(palabra)
  }

  let bits = cuantas * Math.log2(PALABRAS.length)
  let valor: string
  if (opciones.separador === 'numeros') {
    // Una cifra al azar entre cada dos palabras: suma 3,3 bits por hueco.
    valor = elegidas.reduce((acc, palabra) => `${acc}${CIFRAS[enteroAleatorio(10)]}${palabra}`)
    bits += (cuantas - 1) * Math.log2(10)
  } else {
    valor = elegidas.join(SEPARADORES[opciones.separador])
  }
  return { valor, bits }
}

function generarPin(digitos: number): Generada {
  let valor = ''
  for (let i = 0; i < digitos; i++) valor += CIFRAS[enteroAleatorio(10)]
  return { valor, bits: digitos * Math.log2(10) }
}

/** Para pintar la contraseña con las cifras y los símbolos de otro color. */
export function trocear(valor: string): Array<{ texto: string; clase: 'letra' | 'cifra' | 'simbolo' }> {
  const trozos: Array<{ texto: string; clase: 'letra' | 'cifra' | 'simbolo' }> = []
  for (const ch of valor) {
    const clase = /\d/.test(ch) ? 'cifra' : /[\p{L}]/u.test(ch) ? 'letra' : 'simbolo'
    const ultimo = trozos[trozos.length - 1]
    if (ultimo && ultimo.clase === clase) ultimo.texto += ch
    else trozos.push({ texto: ch, clase })
  }
  return trozos
}

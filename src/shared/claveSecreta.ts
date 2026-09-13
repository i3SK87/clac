/**
 * La clave secreta: la segunda llave de la caja fuerte.
 *
 * Es la misma idea que la Secret Key de 1Password, con la misma forma: 34
 * caracteres, de los que los dos primeros dicen la versión, los seis siguientes
 * son el identificador de la cuenta y los veintiséis últimos son el secreto.
 *
 *     C1-7KQ2MX-4TP9A-HX3VE-Z8R2K-N6YWD-QF5LBW
 *
 * El alfabeto tiene 31 signos: del 2 al 9 y las letras de la A a la Z sin la I,
 * la O ni la U, que se confunden con el 1, el 0 y la V al copiarlas a mano del
 * papel. Veintiséis signos de 31 dan 128,8 bits: no se adivina con ningún
 * ordenador que exista.
 *
 * No se memoriza. Se guarda en este equipo, cifrada con la cuenta de Windows, y
 * en el kit de emergencia impreso. Lo que la hace valiosa es que la caja fuerte
 * no se puede atacar sin ella: una copia de seguridad robada, sin la clave, no
 * sirve para probar contraseñas, por débil que sea la tuya.
 */
import { enteroAleatorio } from './aleatorio'

export const VERSION_CLAVE = 'C1'
export const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTVWXYZ'
const LARGO_ID = 6
const LARGO_SECRETO = 26
/** Cómo se agrupan los veintiséis del final para leerlos. */
const GRUPOS = [5, 5, 5, 5, 6]

function tira(largo: number): string {
  let salida = ''
  for (let i = 0; i < largo; i++) salida += ALFABETO[enteroAleatorio(ALFABETO.length)]
  return salida
}

export function nuevoIdCuenta(): string {
  return tira(LARGO_ID)
}

export interface ClaveSecreta {
  version: string
  idCuenta: string
  /** Los veintiséis signos del secreto, sin guiones. */
  secreto: string
}

export function nuevaClaveSecreta(idCuenta: string): ClaveSecreta {
  return { version: VERSION_CLAVE, idCuenta, secreto: tira(LARGO_SECRETO) }
}

/** Escrita como se imprime: con guiones cada pocos signos. */
export function formatearClave(clave: ClaveSecreta): string {
  const trozos: string[] = [clave.version, clave.idCuenta]
  let desde = 0
  for (const largo of GRUPOS) {
    trozos.push(clave.secreto.slice(desde, desde + largo))
    desde += largo
  }
  return trozos.join('-')
}

/**
 * Lee una clave escrita a mano. Da igual cómo venga: con espacios, sin
 * guiones, en minúsculas. Devuelve el porqué si no vale, para poder decirlo.
 */
export function leerClave(texto: string): { clave: ClaveSecreta } | { error: string } {
  const limpio = texto.toUpperCase().replace(/[\s\-–—_.]/g, '')
  const largo = VERSION_CLAVE.length + LARGO_ID + LARGO_SECRETO
  if (limpio.length === 0) return { error: 'Escribe la clave secreta del kit de emergencia.' }
  if (!limpio.startsWith(VERSION_CLAVE)) {
    return { error: `La clave secreta empieza siempre por ${VERSION_CLAVE}.` }
  }
  const raros = [...new Set([...limpio.slice(2)].filter((ch) => !ALFABETO.includes(ch)))]
  if (raros.length) {
    const pista = raros.some((ch) => '01IOU'.includes(ch))
      ? ' La clave no lleva 0, 1, I, O ni U: puede que sea un 2, una Z, una J, una Q o una V.'
      : ''
    return { error: `Hay signos que no pueden estar en una clave secreta: ${raros.join(' ')}.${pista}` }
  }
  if (limpio.length !== largo) {
    return { error: `Tiene ${limpio.length} signos y son ${largo}. Comprueba que no falte ni sobre ninguno.` }
  }
  return {
    clave: {
      version: limpio.slice(0, 2),
      idCuenta: limpio.slice(2, 2 + LARGO_ID),
      secreto: limpio.slice(2 + LARGO_ID)
    }
  }
}

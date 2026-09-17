/**
 * El auto-tecleo: escribe usuario, tabulador y contraseña en la ventana de
 * otro programa, con `SendInput` desde el ayudante — nunca por el
 * portapapeles.
 *
 * El atajo global (`main/index.ts`) captura qué ventana estaba delante justo
 * antes de enseñar el buscador. Al elegir un elemento, se comprueba que sigue
 * siendo esa misma ventana, del mismo proceso, antes de escribir nada.
 */
import { frenteVentana, teclearEn, type ResultadoTeclear } from './ayudante'
import { registrar } from './registro'

interface Objetivo {
  hwnd: bigint
  pid: number
  titulo: string
  exe: string
}

let objetivo: Objetivo | null = null

/**
 * Guarda la ventana de delante para teclear en ella luego. `null` si no se ha
 * podido saber cuál es, o si es una ventana de la propia CLAC: nunca se
 * teclea ahí.
 */
export async function capturarObjetivo(): Promise<Objetivo | null> {
  objetivo = null
  const f = await frenteVentana()
  if (!f || f.pid === process.pid) return null
  objetivo = f
  return f
}

/**
 * Teclea en la ventana capturada. Se puede usar una sola vez: se olvida en
 * cuanto se intenta, haya ido bien o no.
 */
export async function teclear(usuario: string, contrasena: string, conIntro: boolean): Promise<void> {
  const o = objetivo
  objetivo = null
  if (!o) throw new Error('No hay ninguna ventana donde escribir: usa el atajo desde el programa, no desde CLAC.')
  const r = await teclearEn(o.hwnd, o.pid, usuario, contrasena, conIntro)
  if (r !== 'ok') throw new Error(motivo(r))
  registrar('teclear', 'escrito')
}

function motivo(r: ResultadoTeclear): string {
  switch (r) {
    case 'ventana':
      return 'La ventana donde ibas a escribir ya no está: se habrá cerrado.'
    case 'elevada':
      return 'Esa ventana se ejecuta como administrador: Windows no deja que CLAC, sin permisos de administrador, escriba en ella.'
    case 'cambiada':
      return 'La ventana ha cambiado justo antes de escribir: no se ha tecleado nada.'
    case 'bloqueado':
      return 'Windows ha rechazado parte del tecleo. Revisa lo que ha llegado antes de seguir.'
    default:
      return 'El ayudante no ha podido escribir en esa ventana.'
  }
}

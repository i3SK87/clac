/**
 * Lo que se dicen los dos guiones que la extensión mete en la página.
 *
 * Uno vive en el mundo de la propia web (`llave-pagina.ts`), porque es el único
 * sitio desde donde se puede cambiar `navigator.credentials`; el otro vive
 * aparte (`llave-aviso.ts`), donde la web no llega, y es el que dibuja el aviso
 * y habla con CLAC. Se avisan con eventos del propio documento, con el mensaje
 * en texto: lo único que cruza de un mundo al otro sin sorpresas.
 *
 * La web puede escuchar estos avisos y hasta inventárselos, y da igual: lo
 * único que conseguiría es pedir para sí misma lo que ya puede pedir llamando a
 * `navigator.credentials`. El origen no viaja por aquí; lo pone el service
 * worker con lo que dice el navegador.
 */
import type { RespuestaCrearLlave, RespuestaFirmarLlave } from '@shared/navegador'

/** Las webs donde se pueden ofrecer llaves. El localhost, para poder probarlo. */
export const ORIGENES = ['https://*/*', 'http://localhost/*']

export const PETICION = 'clac-llave'
export const RESPUESTA = 'clac-llave-respuesta'

export interface DatosCrear {
  rpId?: string
  rpNombre?: string
  usuarioId: string
  usuario: string
  nombre?: string
  reto: string
  algoritmos: number[]
  excluir: string[]
}

export interface DatosEntrar {
  rpId?: string
  reto: string
  /** Las credenciales que acepta la web. Vacío: las que haya. */
  permitidas: string[]
}

export type PeticionPagina =
  | { id: string; que: 'crear'; datos: DatosCrear }
  | { id: string; que: 'entrar'; datos: DatosEntrar }
  /** La web se ha cansado de esperar o ha abortado: quita el aviso. */
  | { id: string; que: 'cancelar' }

export type ResultadoPagina =
  /** Que siga el navegador con lo suyo: la llave del ordenador, del móvil o de un USB. */
  | { id: string; accion: 'navegador' }
  | { id: string; accion: 'creada'; llave: RespuestaCrearLlave }
  | { id: string; accion: 'entrada'; llave: RespuestaFirmarLlave }
  | { id: string; accion: 'error'; nombre: string; mensaje: string }

export function avisar(nombre: string, mensaje: unknown): void {
  window.dispatchEvent(new CustomEvent(nombre, { detail: JSON.stringify(mensaje) }))
}

/** Lo que contesta el service worker a los guiones de la página. */
export interface RespuestaFondo {
  ok: boolean
  datos?: unknown
  error?: string
  nombreError?: string
}

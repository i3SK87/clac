/**
 * Lo que se dicen la extensión del navegador y CLAC.
 *
 * Mensajes pequeños en JSON, cada uno con su número para casar la respuesta. La
 * extensión nunca pide la caja entera: pide la lista de lo que encaja con la
 * web en la que estás (título y usuario, sin contraseñas) y, cuando pulsas uno,
 * las credenciales de ese uno.
 */
import type { EstadoSesion, Tema } from './tipos'
import type { Paleta } from 'casa/paletas'

export const NOMBRE_ANFITRION = 'com.clac.navegador'

export type Peticion =
  | { id: number; tipo: 'estado' }
  | { id: number; tipo: 'desbloquear'; contrasena: string }
  /** Con Windows Hello: el diálogo sale sobre el navegador. */
  | { id: number; tipo: 'desbloquearHello' }
  | { id: number; tipo: 'buscar'; url: string; consulta: string }
  | { id: number; tipo: 'credenciales'; elementoId: string }
  | { id: number; tipo: 'copiar'; elementoId: string; que: 'usuario' | 'contrasena' | 'totp' }
  /** Una contraseña recién generada: que la copie CLAC, fuera del historial de Win+V. */
  | { id: number; tipo: 'copiarTexto'; texto: string }
  | { id: number; tipo: 'guardar'; url: string; titulo: string; usuario: string; contrasena: string }
  | { id: number; tipo: 'abrirElemento'; elementoId: string }
  | { id: number; tipo: 'abrirApp' }

export interface Respuesta {
  id: number
  ok: boolean
  error?: string
  /** El puente no ha encontrado CLAC abierta. */
  cerrada?: boolean
  datos?: unknown
}

export interface EstadoNavegador {
  sesion: EstadoSesion
  tema: Tema
  paleta: Paleta
  version: string
  /** Bloqueada, se puede abrir con Windows Hello en vez de con la contraseña. */
  hello: boolean
}

export interface ElementoNavegador {
  id: string
  titulo: string
  usuario: string
  web: string
  categoria: string
  /** Es de la web en la que estás. */
  coincide: boolean
  tieneTotp: boolean
  tieneContrasena: boolean
}

export interface Credenciales {
  usuario: string
  contrasena: string
  /** El código de un solo uso de ahora mismo, si el elemento lo tiene. */
  codigo: string | null
  webs: string[]
}

export interface ResultadoGuardar {
  accion: 'creado' | 'actualizado'
  id: string
  titulo: string
}

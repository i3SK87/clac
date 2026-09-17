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
  /* Las llaves de acceso: ver más abajo. */
  | { id: number; tipo: 'llaves'; origen: string; rpId?: string }
  | ({ id: number; tipo: 'llaveCrear' } & PeticionCrearLlave)
  | ({ id: number; tipo: 'llaveFirmar' } & PeticionFirmarLlave)

export interface Respuesta {
  id: number
  ok: boolean
  error?: string
  /** El nombre del fallo tal y como lo espera una web: «NotAllowedError»… */
  nombreError?: string
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

/* ---------- Llaves de acceso ---------- */

/**
 * Lo que la extensión puede pedir desde una página web. El `origen` de estas
 * tres lo pone el service worker con lo que dice el navegador (`sender.origin`),
 * nunca la página: es lo único que impide que una web pida las llaves de otra.
 * Lo demás —buscar, credenciales, copiar— no se atiende desde una página.
 */
export const PETICIONES_DE_PAGINA = ['llaves', 'llaveCrear', 'llaveFirmar', 'desbloquearHello'] as const

/** Una llave guardada, para elegirla en el aviso de la página. */
export interface LlaveNavegador {
  id: string
  elementoId: string
  titulo: string
  usuario: string
  creada: string
}

export interface PeticionCrearLlave {
  origen: string
  rpId?: string
  rpNombre?: string
  /** El identificador que la web le da a tu cuenta, en base64url. */
  usuarioId: string
  usuario: string
  nombre?: string
  /** El reto de la web, en base64url. */
  reto: string
  /** Los algoritmos que acepta la web, en números COSE (-7 es ES256). */
  algoritmos: number[]
  /** Credenciales que la web ya tiene: si una es de CLAC, no se hace otra. */
  excluir: string[]
}

export interface PeticionFirmarLlave {
  origen: string
  rpId?: string
  reto: string
  credencial: string
}

export interface RespuestaCrearLlave {
  id: string
  elementoId: string
  clientDataJSON: string
  attestationObject: string
  authenticatorData: string
  clavePublica: string
  algoritmo: number
}

export interface RespuestaFirmarLlave {
  id: string
  elementoId: string
  clientDataJSON: string
  authenticatorData: string
  firma: string
  usuarioId: string
}

/** Lo que hay que saber para dibujar el aviso: cómo está CLAC y qué llaves tiene de esta web. */
export interface EstadoLlaves {
  sesion: EstadoSesion
  hello: boolean
  tema: Tema
  paleta: Paleta
  llaves: LlaveNavegador[]
}

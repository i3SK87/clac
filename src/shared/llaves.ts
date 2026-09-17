/**
 * Las llaves de acceso (las «passkeys» de WebAuthn).
 *
 * Una llave de acceso es una pareja de claves: la pública se la queda la web y
 * la privada se queda aquí. Para entrar, la web manda un reto, CLAC lo firma
 * con la privada y la web comprueba la firma con la pública que guardó. No hay
 * contraseña que teclear, que la web pueda perder en una filtración ni que se
 * pueda escribir en una web falsa: la firma lleva dentro el dominio para el que
 * se creó la llave, así que en otro dominio no vale de nada.
 *
 * En este archivo está solo lo que entienden por igual CLAC y la extensión:
 * cómo se guarda una llave dentro de un elemento y la comprobación del dominio.
 * Lo que firma y genera claves está en `main/navegador/llaves.ts`: la clave
 * privada no sale nunca del proceso principal de CLAC.
 */
import { todosLosCampos } from './categorias'
import { SUFIJOS_DOBLES } from './webs'
import type { Campo, Detalle } from './tipos'

/** Lo que se guarda, en JSON, dentro del campo «Llave de acceso». */
export interface Llave {
  /** Por si algún día cambia lo que hay dentro. */
  v: 1
  /** El dominio de la web, tal y como lo pidió: «github.com». */
  rpId: string
  /** El identificador de la credencial, en base64url. Es lo que la web recuerda. */
  id: string
  /** El identificador que la web le da a tu cuenta (`user.id`), en base64url. */
  usuarioId: string
  /** El nombre de la cuenta en esa web. */
  usuario: string
  /** El nombre para enseñar, si la web dio uno distinto. */
  nombre: string
  /** La clave privada, en PKCS#8 y base64. Solo la toca el proceso principal. */
  privada: string
  creada: string
}

export const CLAVE_LLAVE = 'llave'
export const ETIQUETA_LLAVE = 'Llave de acceso'

export function escribirLlave(llave: Llave): string {
  return JSON.stringify(llave)
}

export function leerLlave(valor: string): Llave | null {
  if (!valor.trim().startsWith('{')) return null
  try {
    const l = JSON.parse(valor) as Llave
    return l && l.v === 1 && typeof l.rpId === 'string' && typeof l.id === 'string' && typeof l.privada === 'string' ? l : null
  } catch {
    return null
  }
}

/** Las llaves que lleva dentro un elemento, con el campo del que salen. */
export function llavesDe(detalle: Pick<Detalle, 'secciones'>): Array<{ campo: Campo; llave: Llave }> {
  const salida: Array<{ campo: Campo; llave: Llave }> = []
  for (const campo of todosLosCampos(detalle)) {
    if (campo.tipo !== 'llave') continue
    const llave = leerLlave(campo.valor)
    if (llave) salida.push({ campo, llave })
  }
  return salida
}

/* ---------- El dominio de la llave ---------- */

/**
 * Sufijos donde cualquiera puede abrir su sitio: dos páginas de «github.io» son
 * de dos personas distintas, así que ahí no vale hacer una llave para todo
 * «github.io». La lista de verdad (la Public Suffix List) son diez mil líneas;
 * con estos y los de `webs.ts` se cubre lo que se usa.
 */
const SUFIJOS_PROPIOS = new Set([
  'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app', 'web.app',
  'firebaseapp.com', 'appspot.com', 'herokuapp.com', 'onrender.com', 'blogspot.com', 'wordpress.com',
  'azurewebsites.net', 'glitch.me', 'surge.sh', 'neocities.org', 'repl.co', 'ngrok.io', 'ngrok-free.app'
])

export class ErrorLlave extends Error {
  /** El nombre que espera la web: lo que se convierte en un DOMException. */
  constructor(
    public nombre: string,
    mensaje: string
  ) {
    super(mensaje)
    this.name = 'ErrorLlave'
  }
}

/**
 * El dominio para el que vale la llave, comprobado contra el origen de verdad
 * de la pestaña, que lo dice el navegador y no la web.
 *
 * Es lo que hace que una llave no se pueda usar en una web falsa: «micolegio.es»
 * puede pedir llaves de «micolegio.es» y de «es»… no, de «es» tampoco, que es un
 * sufijo público; y desde luego no de «bancosantander.es». Las reglas son las de
 * WebAuthn: el rpId tiene que ser el propio dominio de la página o uno de sus
 * dominios padre, y nunca un sufijo donde cualquiera puede poner su sitio.
 */
export function rpIdDe(origen: string, rpId?: string): string {
  let url: URL
  try {
    url = new URL(origen)
  } catch {
    throw new ErrorLlave('SecurityError', 'La página no tiene un origen que se entienda.')
  }
  const host = url.hostname.toLowerCase()
  const local = host === 'localhost' || host.endsWith('.localhost')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new ErrorLlave('SecurityError', 'Las llaves de acceso solo valen en webs con https.')
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    throw new ErrorLlave('SecurityError', 'Las llaves de acceso necesitan un dominio, no una dirección IP.')
  }
  const pedido = (rpId ?? host).toLowerCase()
  if (pedido !== host && !host.endsWith(`.${pedido}`)) {
    throw new ErrorLlave('SecurityError', `Esta web es ${host} y pide una llave de ${pedido}.`)
  }
  if (pedido !== 'localhost' && (!pedido.includes('.') || SUFIJOS_DOBLES.has(pedido) || SUFIJOS_PROPIOS.has(pedido))) {
    throw new ErrorLlave('SecurityError', `«${pedido}» no es un dominio para el que se pueda hacer una llave.`)
  }
  return pedido
}

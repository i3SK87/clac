/**
 * El fondo de la extensión: el único que habla con CLAC cuando lo que pide algo
 * es una página web.
 *
 * Hace dos cosas.
 *
 * 1. **Pone y quita los guiones de las llaves de acceso.** Solo existen si has
 *    dado el permiso desde el candado; al quitarlo, se van. Se registran a mano
 *    (y no en el manifiesto) justo por eso: así la extensión se instala sin
 *    pedir entrar en todas las webs, y solo entra si tú lo enciendes.
 *
 * 2. **Pasa a CLAC lo que piden esos guiones, con el origen puesto por él.** El
 *    origen lo dice el navegador (`sender.origin`), nunca la página: es lo que
 *    impide que una web pida las llaves de otra. Y solo se dejan pasar las
 *    cuatro peticiones de las llaves: desde una web no se pueden pedir ni la
 *    lista de la caja ni las contraseñas de nada.
 */
import { NOMBRE_ANFITRION, PETICIONES_DE_PAGINA, type Peticion, type Respuesta } from '@shared/navegador'
import { ORIGENES, type RespuestaFondo } from './llave-comun'

const GUIONES: chrome.scripting.RegisteredContentScript[] = [
  {
    id: 'llave-pagina',
    js: ['llave-pagina.js'],
    matches: ORIGENES,
    // En el mundo de la propia web, que es el único sitio desde donde se puede
    // cambiar `navigator.credentials`, y antes de que la web arranque.
    world: 'MAIN',
    runAt: 'document_start',
    allFrames: false,
    persistAcrossSessions: true
  },
  {
    id: 'llave-aviso',
    js: ['llave-aviso.js'],
    matches: ORIGENES,
    world: 'ISOLATED',
    runAt: 'document_start',
    allFrames: false,
    persistAcrossSessions: true
  }
]

const IDS = GUIONES.map((g) => g.id)

/** Deja los guiones como diga el permiso. Se llama al arrancar y al cambiarlo. */
async function sincronizar(): Promise<void> {
  try {
    if (!chrome.permissions) return
    const permiso = await chrome.permissions.contains({ origins: ORIGENES })
    const puestos = await chrome.scripting.getRegisteredContentScripts()
    const hay = IDS.every((id) => puestos.some((g) => g.id === id))
    if (permiso && !hay) {
      await chrome.scripting.unregisterContentScripts({ ids: IDS }).catch(() => undefined)
      await chrome.scripting.registerContentScripts(GUIONES)
    } else if (!permiso && puestos.some((g) => IDS.includes(g.id))) {
      await chrome.scripting.unregisterContentScripts({ ids: IDS })
    }
  } catch (e) {
    console.warn('CLAC: no se han podido poner los guiones de las llaves', e)
  }
}

// Con interrogación: si algún navegador no tuviera esto, el fondo se quedaría
// muerto entero y la extensión dejaría de rellenar también las contraseñas.
chrome.permissions?.onAdded.addListener(() => void sincronizar())
chrome.permissions?.onRemoved.addListener(() => void sincronizar())
chrome.runtime.onInstalled.addListener(() => void sincronizar())
chrome.runtime.onStartup.addListener(() => void sincronizar())
void sincronizar()

/* ---------- El puente con CLAC ---------- */

const ESPERA = 15_000
/** Windows Hello espera a que la persona confirme: ahí no hay prisa. */
const ESPERA_HELLO = 190_000
/** El puente es un proceso aparte: si no se usa, se suelta. */
const OCIO = 30_000

let puerto: chrome.runtime.Port | null = null
let siguiente = 1
let soltar: ReturnType<typeof setTimeout> | undefined
const esperando = new Map<number, (r: Respuesta) => void>()

function conectar(): chrome.runtime.Port {
  const p = chrome.runtime.connectNative(NOMBRE_ANFITRION)
  p.onMessage.addListener((r: Respuesta) => {
    const contestar = esperando.get(r.id)
    if (!contestar) return
    esperando.delete(r.id)
    contestar(r)
  })
  p.onDisconnect.addListener(() => {
    const motivo = chrome.runtime.lastError?.message ?? 'Se ha cortado la conexión con CLAC.'
    for (const [id, contestar] of esperando) contestar({ id, ok: false, cerrada: true, error: motivo })
    esperando.clear()
    puerto = null
  })
  return p
}

function descansar(): void {
  clearTimeout(soltar)
  soltar = setTimeout(() => {
    if (esperando.size > 0) return
    puerto?.disconnect()
    puerto = null
  }, OCIO)
}

function pedirAClac(peticion: Peticion): Promise<Respuesta> {
  return new Promise((resolver) => {
    if (!puerto) puerto = conectar()
    const contestar = (r: Respuesta): void => {
      clearTimeout(plazo)
      descansar()
      resolver(r)
    }
    const plazo = setTimeout(() => {
      esperando.delete(peticion.id)
      contestar({ id: peticion.id, ok: false, error: 'CLAC no contesta.' })
    }, peticion.tipo === 'desbloquearHello' ? ESPERA_HELLO : ESPERA)
    esperando.set(peticion.id, contestar)
    puerto.postMessage(peticion)
  })
}

/* ---------- Lo que llega de las páginas ---------- */

async function atender(mensaje: { tipo?: string } | undefined, quien: chrome.runtime.MessageSender): Promise<RespuestaFondo> {
  if (quien.id !== chrome.runtime.id) return { ok: false, error: 'Ese mensaje no es de esta extensión.' }
  // La hoja de estilos del aviso: en la página no se puede pedir un archivo de
  // la extensión, así que se lo da el fondo, que sí puede.
  if (mensaje?.tipo === 'estilos') {
    const hoja = await fetch(chrome.runtime.getURL('llave.css')).then((r) => r.text())
    return { ok: true, datos: hoja }
  }
  // Del candado, al encender o apagar el permiso.
  if (mensaje?.tipo === 'sincronizar' && !quien.tab) {
    await sincronizar()
    return { ok: true }
  }
  if (!quien.tab || quien.frameId !== 0 || !quien.origin) return { ok: false, error: 'Esto no se pide desde ahí.' }
  if (!(PETICIONES_DE_PAGINA as readonly string[]).includes(mensaje?.tipo ?? '')) {
    return { ok: false, error: 'Desde una página solo se pueden pedir las llaves de acceso.' }
  }
  const peticion = { ...mensaje, id: siguiente++, origen: quien.origin } as Peticion
  const r = await pedirAClac(peticion)
  return { ok: r.ok, datos: r.datos, error: r.error, nombreError: r.nombreError }
}

chrome.runtime.onMessage.addListener((mensaje, quien, responder) => {
  void atender(mensaje as { tipo?: string } | undefined, quien).then(responder, (e: unknown) =>
    responder({ ok: false, error: e instanceof Error ? e.message : String(e) })
  )
  // Se contesta más tarde: hay que mantener el canal abierto.
  return true
})

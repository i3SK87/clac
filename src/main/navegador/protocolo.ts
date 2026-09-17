/**
 * Lo que CLAC contesta a la extensión.
 *
 * No sabe de Electron ni del canal por el que llegan los mensajes: recibe una
 * petición y las piezas que necesita, y devuelve la respuesta. Así se prueba en
 * Node con una caja fuerte de verdad.
 */
import { buscar, sugerencias } from '@shared/buscar'
import { contrasenaDe, seccionesDePlantilla, totpDe, usuarioDe } from '@shared/categorias'
import { codigoTotp, leerTotp } from '@shared/totp'
import { dominioBase, dominioDe } from '@shared/webs'
import type { CajaFuerte } from '../boveda/boveda'
import type { Ajustes, ElementoLista, EstadoSesion } from '@shared/tipos'
import { ErrorLlave, rpIdDe } from '@shared/llaves'
import { crearLlave, firmarLlave, llavesParaWeb } from './llaves'
import type { Credenciales, ElementoNavegador, EstadoLlaves, EstadoNavegador, Peticion, Respuesta, ResultadoGuardar } from '@shared/navegador'

export interface Piezas {
  caja: () => CajaFuerte
  estado: () => EstadoSesion
  ajustes: () => Ajustes
  version: string
  desbloquear: (contrasena: string) => void
  /** Si ahora se podría abrir con Windows Hello. */
  helloListo: () => boolean
  desbloquearHello: () => Promise<void>
  copiar: (texto: string) => Promise<unknown>
  abrirElemento: (id: string) => void
  /** La caja ha cambiado por algo de la extensión: la ventana tiene que recargar la lista. */
  alCambiar: () => void
}

/** Las categorías que tienen algo que rellenar en un formulario. */
function rellenable(e: ElementoLista): boolean {
  return e.estado === 'activo' && (e.categoria === 'login' || e.categoria === 'contrasena' || e.webs.length > 0)
}

export function elementosParaWeb(caja: CajaFuerte, url: string, consulta: string): ElementoNavegador[] {
  const base = dominioBase(url)
  const lista = caja.listar().filter(rellenable)
  const coincide = (e: ElementoLista): boolean => base !== '' && e.webs.some((w) => dominioBase(w) === base)

  // Sin escribir nada: lo de esta web arriba y, debajo, lo que más usas.
  const elegidos = consulta.trim()
    ? buscar(lista, consulta).slice(0, 40)
    : [
        ...lista.filter(coincide).sort((a, b) => b.usos - a.usos || a.titulo.localeCompare(b.titulo, 'es')),
        ...sugerencias(lista.filter((e) => !coincide(e)), 8)
      ].slice(0, 40)

  return elegidos.map((e) => {
    const detalle = caja.obtener(e.id)
    return {
      id: e.id,
      titulo: e.titulo,
      usuario: usuarioDe(detalle),
      web: e.webs[0] ?? '',
      categoria: e.categoria,
      coincide: coincide(e),
      tieneTotp: e.tieneTotp,
      tieneContrasena: contrasenaDe(detalle) !== ''
    }
  })
}

export async function credencialesDe(caja: CajaFuerte, id: string): Promise<Credenciales> {
  const e = caja.obtener(id)
  if (e.estado !== 'activo') throw new Error('Ese elemento está archivado o en la papelera.')
  const cfg = leerTotp(totpDe(e))
  caja.anotarUso(id)
  return {
    usuario: usuarioDe(e),
    contrasena: contrasenaDe(e),
    codigo: cfg ? await codigoTotp(cfg) : null,
    webs: e.webs
  }
}

/**
 * Guarda lo escrito en una página. Si ya hay un inicio de sesión de esa web con
 * ese usuario, se le cambia la contraseña —y la de antes queda en su historial—;
 * si no, se crea uno nuevo en la primera caja fuerte.
 */
export function guardarDesdeWeb(caja: CajaFuerte, url: string, titulo: string, usuario: string, contrasena: string): ResultadoGuardar {
  if (!contrasena) throw new Error('No hay ninguna contraseña que guardar.')
  const base = dominioBase(url)
  const existente = caja
    .listar()
    .filter((e) => e.estado === 'activo' && e.categoria === 'login' && base && e.webs.some((w) => dominioBase(w) === base))
    .map((e) => caja.obtener(e.id))
    .find((e) => usuarioDe(e) === usuario)

  if (existente) {
    const secciones = existente.secciones.map((s, i) =>
      i !== 0 ? s : { ...s, campos: s.campos.map((c) => (c.clave === 'contrasena' ? { ...c, valor: contrasena } : c)) }
    )
    const guardado = caja.guardar({ ...existente, secciones })
    return { accion: 'actualizado', id: guardado.id, titulo: guardado.titulo }
  }

  const secciones = seccionesDePlantilla('login')
  for (const c of secciones[0].campos) {
    if (c.clave === 'usuario') c.valor = usuario
    if (c.clave === 'contrasena') c.valor = contrasena
  }
  const origen = (() => {
    try {
      return new URL(url).origin
    } catch {
      return url
    }
  })()
  const nuevo = caja.guardar({
    bovedaId: caja.bovedas()[0].id,
    categoria: 'login',
    titulo: titulo.trim() || dominioDe(url) || 'Sin título',
    webs: [origen],
    etiquetas: [],
    favorito: false,
    secciones,
    notas: ''
  })
  return { accion: 'creado', id: nuevo.id, titulo: nuevo.titulo }
}

export async function atender(p: Peticion, piezas: Piezas): Promise<Respuesta> {
  try {
    const datos = await responder(p, piezas)
    return { id: p.id, ok: true, datos }
  } catch (error) {
    return {
      id: p.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      // A la página le hace falta el nombre del fallo: WebAuthn distingue entre
      // «esa llave ya la tienes» y «no ha podido ser».
      nombreError: error instanceof ErrorLlave ? error.nombre : undefined
    }
  }
}

async function responder(p: Peticion, piezas: Piezas): Promise<unknown> {
  if (p.tipo === 'estado') {
    const a = piezas.ajustes()
    const sesion = piezas.estado()
    return {
      sesion,
      tema: a.theme,
      paleta: a.palette,
      version: piezas.version,
      hello: sesion === 'bloqueada' && piezas.helloListo()
    } satisfies EstadoNavegador
  }
  if (p.tipo === 'desbloquear') {
    piezas.desbloquear(p.contrasena)
    return null
  }
  if (p.tipo === 'desbloquearHello') {
    await piezas.desbloquearHello()
    return null
  }
  if (p.tipo === 'abrirApp') return null
  // Las llaves de una web se pueden preguntar con la caja cerrada: hace falta
  // saber que está bloqueada para ofrecer abrirla en el aviso de la página.
  if (p.tipo === 'llaves') {
    const a = piezas.ajustes()
    const sesion = piezas.estado()
    // El dominio se comprueba también con la caja cerrada: así el aviso que sale
    // en la página no puede enseñar el nombre de una web que no es la suya.
    rpIdDe(p.origen, p.rpId)
    return {
      sesion,
      hello: sesion === 'bloqueada' && piezas.helloListo(),
      tema: a.theme,
      paleta: a.palette,
      llaves: sesion === 'abierta' ? llavesParaWeb(piezas.caja(), p.origen, p.rpId) : []
    } satisfies EstadoLlaves
  }
  if (p.tipo === 'copiarTexto') return piezas.copiar(p.texto)

  // Todo lo demás, con la caja abierta.
  if (piezas.estado() !== 'abierta') throw new Error('CLAC está bloqueada.')
  const caja = piezas.caja()
  switch (p.tipo) {
    case 'buscar':
      return elementosParaWeb(caja, p.url, p.consulta)
    case 'credenciales':
      return credencialesDe(caja, p.elementoId)
    case 'copiar': {
      const c = await credencialesDe(caja, p.elementoId)
      const texto = p.que === 'usuario' ? c.usuario : p.que === 'contrasena' ? c.contrasena : (c.codigo ?? '')
      if (!texto) throw new Error('Ese elemento no lo tiene.')
      return piezas.copiar(texto)
    }
    case 'guardar': {
      // Sin este aviso, lo guardado desde la web no salía en la ventana hasta
      // reiniciar CLAC: la caja lo tenía, pero la lista de la ventana era la de antes.
      const r = guardarDesdeWeb(caja, p.url, p.titulo, p.usuario, p.contrasena)
      piezas.alCambiar()
      return r
    }
    case 'abrirElemento':
      // Si el popup lleva un rato abierto, su lista puede ir por detrás de la
      // caja: mejor que lo diga aquí a que la ventana reciba un id que ya no está.
      caja.obtener(p.elementoId)
      piezas.abrirElemento(p.elementoId)
      return null
    case 'llaveCrear': {
      // La caja fuerte tiene un elemento nuevo, o uno con una llave nueva.
      const r = crearLlave(caja, p)
      piezas.alCambiar()
      return r
    }
    case 'llaveFirmar':
      return firmarLlave(caja, p)
  }
}

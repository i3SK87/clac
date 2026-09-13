/**
 * Lo que CLAC contesta a la extensión.
 *
 * No sabe de Electron ni del canal por el que llegan los mensajes: recibe una
 * petición y las piezas que necesita, y devuelve la respuesta. Así se prueba en
 * Node con una caja fuerte de verdad.
 */
import { buscar } from '@shared/buscar'
import { contrasenaDe, seccionesDePlantilla, totpDe, usuarioDe } from '@shared/categorias'
import { codigoTotp, leerTotp } from '@shared/totp'
import { dominioBase, dominioDe } from '@shared/webs'
import type { CajaFuerte } from '../boveda/boveda'
import type { Ajustes, ElementoLista, EstadoSesion } from '@shared/tipos'
import type { Credenciales, ElementoNavegador, EstadoNavegador, Peticion, Respuesta, ResultadoGuardar } from '@shared/navegador'

export interface Piezas {
  caja: () => CajaFuerte
  estado: () => EstadoSesion
  ajustes: () => Ajustes
  version: string
  desbloquear: (contrasena: string) => void
  copiar: (texto: string) => Promise<unknown>
  abrirElemento: (id: string) => void
}

/** Las categorías que tienen algo que rellenar en un formulario. */
function rellenable(e: ElementoLista): boolean {
  return e.estado === 'activo' && (e.categoria === 'login' || e.categoria === 'contrasena' || e.webs.length > 0)
}

export function elementosParaWeb(caja: CajaFuerte, url: string, consulta: string): ElementoNavegador[] {
  const base = dominioBase(url)
  const lista = caja.listar().filter(rellenable)
  const coincide = (e: ElementoLista): boolean => base !== '' && e.webs.some((w) => dominioBase(w) === base)

  const elegidos = consulta.trim()
    ? buscar(lista, consulta).slice(0, 40)
    : lista
        .filter((e) => coincide(e) || e.favorito)
        .sort((a, b) => Number(coincide(b)) - Number(coincide(a)) || b.usos - a.usos || a.titulo.localeCompare(b.titulo, 'es'))
        .slice(0, 40)

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
    return { id: p.id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function responder(p: Peticion, piezas: Piezas): Promise<unknown> {
  if (p.tipo === 'estado') {
    const a = piezas.ajustes()
    return { sesion: piezas.estado(), tema: a.theme, paleta: a.palette, version: piezas.version } satisfies EstadoNavegador
  }
  if (p.tipo === 'desbloquear') {
    piezas.desbloquear(p.contrasena)
    return null
  }
  if (p.tipo === 'abrirApp') return null
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
    case 'guardar':
      return guardarDesdeWeb(caja, p.url, p.titulo, p.usuario, p.contrasena)
    case 'abrirElemento':
      piezas.abrirElemento(p.elementoId)
      return null
  }
}

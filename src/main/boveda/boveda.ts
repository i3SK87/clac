/**
 * La caja fuerte: abrirla, cerrarla y todo lo que se hace con ella abierta.
 *
 * No sabe nada de Electron a propósito. La clave secreta se la da quien la
 * llama —en la aplicación sale del almacén cifrado de Windows; en las pruebas,
 * de un texto—, y así todo esto se comprueba en Node pelado, sin ventanas.
 *
 * Con la caja abierta, en memoria hay tres cosas: la clave de la cuenta, la
 * clave de cada caja fuerte y los resúmenes ya descifrados, que es lo que hace
 * falta para listar y buscar al instante. Los detalles se descifran al pedirlos
 * y no se guardan. Al bloquear, las claves se sobrescriben con ceros y se
 * sueltan; lo que JavaScript haya copiado por su cuenta no se puede borrar a
 * mano, pero deja de estar al alcance de nada.
 */
import type { DatabaseSync } from 'node:sqlite'
import { DatabaseSync as Db } from 'node:sqlite'
import { copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  KDF_POR_DEFECTO,
  abrir,
  abrirJson,
  aleatorio,
  derivarClaveDesbloqueo,
  nuevaSal,
  sellar,
  sellarJson,
  ErrorDescifrado,
  type ParametrosKdf
} from './cripto'
import { NOMBRE_ARCHIVO, abrirArchivo, transaccion } from './db'
import {
  contrasenaDe,
  esCategoria,
  nuevoId,
  subtituloDe,
  totpDe,
  usuarioDe
} from '@shared/categorias'
import { dominioDe } from '@shared/webs'
import type { ClaveSecreta } from '@shared/claveSecreta'
import type { Importado } from '@shared/importar'
import type { ParaRevisar, ResultadoFiltracion } from '@shared/watchtower'
import type {
  AdjuntoInfo,
  Boveda,
  BovedaEntrada,
  Detalle,
  Elemento,
  ElementoEntrada,
  ElementoLista,
  EstadoElemento,
  Resumen,
  Seccion,
  VersionHistorial
} from '@shared/tipos'

export class ErrorContrasena extends Error {
  constructor() {
    super('La contraseña no es correcta.')
    this.name = 'ErrorContrasena'
  }
}

export class ErrorBloqueada extends Error {
  constructor() {
    super('La caja fuerte está bloqueada.')
    this.name = 'ErrorBloqueada'
  }
}

/** Lo mínimo que se le pide a la contraseña maestra. */
export const MINIMO_CONTRASENA = 10
/** Cuántas versiones anteriores se guardan de cada elemento. */
const VERSIONES = 20
/** Los días que pasa un elemento en la papelera antes de irse del todo. */
export const DIAS_PAPELERA = 30
/** Lo más grande que se admite como adjunto. */
export const MAXIMO_ADJUNTO = 50 * 1024 * 1024

interface Cuenta {
  id: string
  creada: string
}

/** Lo que se guarda cifrado con la clave de la cuenta y no es de ningún elemento. */
export interface DatosCuenta {
  filtraciones: Record<string, ResultadoFiltracion>
  filtradasRevisadasEn: string | null
}

const DATOS_CUENTA_VACIOS: DatosCuenta = { filtraciones: {}, filtradasRevisadasEn: null }

interface Sesion {
  mk: Buffer
  claves: Map<string, Buffer>
  bovedas: Map<string, Boveda>
  lista: Map<string, ElementoLista>
  /** Elementos que no se han podido descifrar. No debería pasar nunca. */
  danados: string[]
}

interface FilaElemento {
  id: string
  boveda_id: string
  estado: EstadoElemento
  resumen: Uint8Array
  detalle: Uint8Array
  creado: string
  modificado: string
  eliminado: string | null
  usado: string | null
  usos: number
}

const ahora = (): string => new Date().toISOString()

export class CajaFuerte {
  readonly db: DatabaseSync
  private sesion: Sesion | null = null
  private readonly kdfNuevas: typeof KDF_POR_DEFECTO

  /**
   * @param kdf Solo para las pruebas: unos parámetros más ligeros para no
   *   esperar 300 ms en cada una. La aplicación usa siempre los de fábrica.
   */
  constructor(
    readonly carpeta: string,
    kdf?: Partial<typeof KDF_POR_DEFECTO>
  ) {
    this.db = abrirArchivo(join(carpeta, NOMBRE_ARCHIVO))
    this.kdfNuevas = { ...KDF_POR_DEFECTO, ...kdf }
  }

  cerrar(): void {
    this.bloquear()
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      this.db.close()
    } catch {
      // Cerrar es lo último; si falla, no queda nada que salvar.
    }
  }

  /* ---------- Metadatos en claro ---------- */

  private meta<T>(clave: string): T | null {
    const fila = this.db.prepare('SELECT valor FROM meta WHERE clave = ?').get(clave) as { valor: string } | undefined
    return fila ? (JSON.parse(fila.valor) as T) : null
  }

  private ponerMeta(clave: string, valor: unknown): void {
    this.db
      .prepare('INSERT INTO meta (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
      .run(clave, JSON.stringify(valor))
  }

  existe(): boolean {
    return this.meta<Cuenta>('cuenta') != null
  }

  idCuenta(): string | null {
    return this.meta<Cuenta>('cuenta')?.id ?? null
  }

  abierta(): boolean {
    return this.sesion != null
  }

  private s(): Sesion {
    if (!this.sesion) throw new ErrorBloqueada()
    return this.sesion
  }

  /* ---------- Crear, abrir y cerrar ---------- */

  crear(contrasena: string, clave: ClaveSecreta): void {
    if (this.existe()) throw new Error('Ya hay una caja fuerte en esta carpeta.')
    comprobarContrasenaNueva(contrasena)

    const kdf: ParametrosKdf = { ...this.kdfNuevas, sal: nuevaSal() }
    const auk = derivarClaveDesbloqueo(contrasena, clave.secreto, clave.idCuenta, kdf)
    const mk = aleatorio(32)
    const creada = ahora()

    transaccion(this.db, () => {
      this.ponerMeta('formato', 1)
      this.ponerMeta('cuenta', { id: clave.idCuenta, creada } satisfies Cuenta)
      this.ponerMeta('kdf', kdf)
      this.ponerMeta('claveCuenta', sellar(auk, mk, 'cuenta:clave').toString('base64'))
      this.ponerMeta('datosCuenta', sellarJson(mk, DATOS_CUENTA_VACIOS, 'cuenta:datos').toString('base64'))
    })
    auk.fill(0)

    this.sesion = { mk, claves: new Map(), bovedas: new Map(), lista: new Map(), danados: [] }
    this.guardarBoveda({ nombre: 'Personal', descripcion: '', icono: 'vault', color: '#2f7de1' })
  }

  /** Abre la caja. Lanza `ErrorContrasena` si la contraseña o la clave secreta no casan. */
  desbloquear(contrasena: string, secreto: string): void {
    this.abrirCon(this.abrirClaveCuenta(contrasena, secreto))
  }

  /**
   * Abre con la clave de la cuenta ya en la mano, sin contraseña: es lo que
   * hace Windows Hello con la que guardó al bloquearse. Si no es la de esta
   * caja, no abre ninguna caja fuerte y lanza `ErrorContrasena`. Se queda con
   * una copia: la que recibe la puede borrar quien la ha dado.
   */
  desbloquearConClaveCuenta(clave: Buffer): void {
    const mk = Buffer.from(clave)
    try {
      this.abrirCon(mk)
    } catch (error) {
      mk.fill(0)
      if (error instanceof ErrorDescifrado) throw new ErrorContrasena()
      throw error
    }
  }

  /** Una copia de la clave de la cuenta, para guardarla mientras la caja está bloqueada. */
  copiaClaveCuenta(): Buffer {
    return Buffer.from(this.s().mk)
  }

  private abrirCon(mk: Buffer): void {
    const sesion: Sesion = { mk, claves: new Map(), bovedas: new Map(), lista: new Map(), danados: [] }
    // Con la clave equivocada, lo primero que falla es el sobre de los datos de la cuenta.
    const sobre = this.meta<string>('datosCuenta')
    if (sobre) abrir(mk, Buffer.from(sobre, 'base64'), 'cuenta:datos').fill(0)

    const filas = this.db.prepare('SELECT id, clave, datos, orden, creada FROM bovedas ORDER BY orden, creada').all() as unknown as Array<{
      id: string
      clave: Uint8Array
      datos: Uint8Array
      orden: number
      creada: string
    }>
    try {
      for (const f of filas) {
        const vk = abrir(mk, f.clave, `boveda:${f.id}:clave`)
        sesion.claves.set(f.id, vk)
        const datos = abrirJson<Omit<Boveda, 'id' | 'orden' | 'creada'>>(vk, f.datos, `boveda:${f.id}:datos`)
        sesion.bovedas.set(f.id, { ...datos, id: f.id, orden: f.orden, creada: f.creada })
      }
    } catch (error) {
      for (const k of sesion.claves.values()) k.fill(0)
      throw error
    }

    this.sesion = sesion
    this.cargarLista()
    this.purgarPapelera()
  }

  private abrirClaveCuenta(contrasena: string, secreto: string): Buffer {
    const cuenta = this.meta<Cuenta>('cuenta')
    const kdf = this.meta<ParametrosKdf>('kdf')
    const sobre = this.meta<string>('claveCuenta')
    if (!cuenta || !kdf || !sobre) throw new Error('No hay caja fuerte que abrir.')
    const auk = derivarClaveDesbloqueo(contrasena, secreto, cuenta.id, kdf)
    try {
      return abrir(auk, Buffer.from(sobre, 'base64'), 'cuenta:clave')
    } catch (error) {
      if (error instanceof ErrorDescifrado) throw new ErrorContrasena()
      throw error
    } finally {
      auk.fill(0)
    }
  }

  /** Para lo delicado —exportar, ver el kit—: se vuelve a pedir la contraseña. */
  comprobarContrasena(contrasena: string, secreto: string): boolean {
    try {
      this.abrirClaveCuenta(contrasena, secreto).fill(0)
      return true
    } catch (error) {
      if (error instanceof ErrorContrasena) return false
      throw error
    }
  }

  bloquear(): void {
    if (!this.sesion) return
    this.sesion.mk.fill(0)
    for (const k of this.sesion.claves.values()) k.fill(0)
    this.sesion.claves.clear()
    this.sesion.lista.clear()
    this.sesion.bovedas.clear()
    this.sesion = null
  }

  /**
   * Cambia la contraseña maestra. Solo hay que volver a cerrar un sobre —el de
   * la clave de la cuenta—: las cajas fuertes y los elementos no se tocan.
   */
  cambiarContrasena(actual: string, nueva: string, secreto: string): void {
    comprobarContrasenaNueva(nueva)
    const cuenta = this.meta<Cuenta>('cuenta')!
    const mk = this.abrirClaveCuenta(actual, secreto)
    const kdf: ParametrosKdf = { ...this.kdfNuevas, sal: nuevaSal() }
    const auk = derivarClaveDesbloqueo(nueva, secreto, cuenta.id, kdf)
    transaccion(this.db, () => {
      this.ponerMeta('kdf', kdf)
      this.ponerMeta('claveCuenta', sellar(auk, mk, 'cuenta:clave').toString('base64'))
    })
    auk.fill(0)
    mk.fill(0)
  }

  /* ---------- Datos de la cuenta ---------- */

  datosCuenta(): DatosCuenta {
    const sobre = this.meta<string>('datosCuenta')
    if (!sobre) return { ...DATOS_CUENTA_VACIOS }
    return { ...DATOS_CUENTA_VACIOS, ...abrirJson<DatosCuenta>(this.s().mk, Buffer.from(sobre, 'base64'), 'cuenta:datos') }
  }

  guardarDatosCuenta(cambios: Partial<DatosCuenta>): void {
    const datos = { ...this.datosCuenta(), ...cambios }
    this.ponerMeta('datosCuenta', sellarJson(this.s().mk, datos, 'cuenta:datos').toString('base64'))
  }

  /* ---------- Cajas fuertes ---------- */

  bovedas(): Boveda[] {
    return [...this.s().bovedas.values()].sort((a, b) => a.orden - b.orden || a.creada.localeCompare(b.creada))
  }

  guardarBoveda(entrada: BovedaEntrada): Boveda {
    const s = this.s()
    const nombre = entrada.nombre.trim()
    if (!nombre) throw new Error('La caja fuerte necesita un nombre.')
    const repetida = this.bovedas().find((b) => b.id !== entrada.id && b.nombre.toLowerCase() === nombre.toLowerCase())
    if (repetida) throw new Error(`Ya hay una caja fuerte que se llama «${repetida.nombre}».`)

    const datos = { nombre, descripcion: entrada.descripcion.trim(), icono: entrada.icono, color: entrada.color }

    if (entrada.id) {
      const vk = s.claves.get(entrada.id)
      const actual = s.bovedas.get(entrada.id)
      if (!vk || !actual) throw new Error('Esa caja fuerte ya no existe.')
      this.db
        .prepare('UPDATE bovedas SET datos = ? WHERE id = ?')
        .run(sellarJson(vk, datos, `boveda:${entrada.id}:datos`), entrada.id)
      const boveda = { ...actual, ...datos }
      s.bovedas.set(entrada.id, boveda)
      return boveda
    }

    const id = nuevoId()
    const vk = aleatorio(32)
    const orden = s.bovedas.size
    const creada = ahora()
    this.db
      .prepare('INSERT INTO bovedas (id, clave, datos, orden, creada) VALUES (?, ?, ?, ?, ?)')
      .run(id, sellar(s.mk, vk, `boveda:${id}:clave`), sellarJson(vk, datos, `boveda:${id}:datos`), orden, creada)
    const boveda: Boveda = { ...datos, id, orden, creada }
    s.claves.set(id, vk)
    s.bovedas.set(id, boveda)
    return boveda
  }

  /** Solo se borra vacía, y nunca la última. */
  eliminarBoveda(id: string): void {
    const s = this.s()
    if (!s.bovedas.has(id)) throw new Error('Esa caja fuerte ya no existe.')
    if (s.bovedas.size === 1) throw new Error('Es la única caja fuerte que hay: no se puede borrar.')
    const n = (this.db.prepare('SELECT COUNT(*) AS n FROM elementos WHERE boveda_id = ?').get(id) as { n: number }).n
    if (n > 0) {
      throw new Error(
        `Tiene ${n} ${n === 1 ? 'elemento' : 'elementos'} (contando el archivo y la papelera). Muévelos o bórralos antes.`
      )
    }
    this.db.prepare('DELETE FROM bovedas WHERE id = ?').run(id)
    s.claves.get(id)?.fill(0)
    s.claves.delete(id)
    s.bovedas.delete(id)
  }

  reordenarBovedas(ids: string[]): void {
    const s = this.s()
    transaccion(this.db, () => {
      ids.forEach((id, orden) => {
        this.db.prepare('UPDATE bovedas SET orden = ? WHERE id = ?').run(orden, id)
        const b = s.bovedas.get(id)
        if (b) s.bovedas.set(id, { ...b, orden })
      })
    })
  }

  private claveDe(bovedaId: string): Buffer {
    const vk = this.s().claves.get(bovedaId)
    if (!vk) throw new Error('Esa caja fuerte ya no existe.')
    return vk
  }

  /* ---------- Elementos ---------- */

  private cargarLista(): void {
    const s = this.s()
    s.lista.clear()
    s.danados = []
    const adjuntos = new Map(
      (this.db.prepare('SELECT elemento_id, COUNT(*) AS n FROM adjuntos GROUP BY elemento_id').all() as unknown as Array<{
        elemento_id: string
        n: number
      }>).map((f) => [f.elemento_id, f.n])
    )
    const filas = this.db.prepare('SELECT * FROM elementos').all() as unknown as FilaElemento[]
    for (const f of filas) {
      try {
        s.lista.set(f.id, this.aLista(f, adjuntos.get(f.id) ?? 0))
      } catch (error) {
        if (!(error instanceof ErrorDescifrado)) throw error
        s.danados.push(f.id)
      }
    }
  }

  private aLista(f: FilaElemento, adjuntos: number): ElementoLista {
    const vk = this.claveDe(f.boveda_id)
    const resumen = abrirJson<Resumen>(vk, f.resumen, `elemento:${f.id}:resumen`)
    return {
      ...resumen,
      id: f.id,
      bovedaId: f.boveda_id,
      estado: f.estado,
      creado: f.creado,
      modificado: f.modificado,
      usado: f.usado,
      usos: Number(f.usos),
      adjuntos,
      eliminadoEn: f.eliminado
    }
  }

  listar(): ElementoLista[] {
    return [...this.s().lista.values()]
  }

  danados(): number {
    return this.s().danados.length
  }

  private fila(id: string): FilaElemento {
    const f = this.db.prepare('SELECT * FROM elementos WHERE id = ?').get(id) as unknown as FilaElemento | undefined
    if (!f) throw new Error('Ese elemento ya no existe.')
    return f
  }

  private detalleDe(f: FilaElemento): Detalle {
    return abrirJson<Detalle>(this.claveDe(f.boveda_id), f.detalle, `elemento:${f.id}:detalle`)
  }

  obtener(id: string): Elemento {
    const s = this.s()
    const f = this.fila(id)
    const lista = s.lista.get(id) ?? this.aLista(f, 0)
    return { ...lista, ...this.detalleDe(f), adjuntosInfo: this.adjuntosDe(id, f.boveda_id) }
  }

  guardar(entrada: ElementoEntrada): Elemento {
    const s = this.s()
    if (!esCategoria(entrada.categoria)) throw new Error('Categoría desconocida.')
    if (!s.bovedas.has(entrada.bovedaId)) throw new Error('Esa caja fuerte ya no existe.')

    const detalle: Detalle = { secciones: limpiarSecciones(entrada.secciones), notas: entrada.notas }
    const resumen: Resumen = {
      titulo: entrada.titulo.trim() || 'Sin título',
      categoria: entrada.categoria,
      subtitulo: subtituloDe(entrada.categoria, detalle),
      webs: [...new Set(entrada.webs.map((w) => w.trim()).filter(Boolean))],
      etiquetas: [...new Set(entrada.etiquetas.map((e) => e.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
      favorito: entrada.favorito,
      tieneTotp: totpDe(detalle) !== ''
    }
    const momento = ahora()

    if (!entrada.id) {
      const id = nuevoId()
      const vk = this.claveDe(entrada.bovedaId)
      this.db
        .prepare('INSERT INTO elementos (id, boveda_id, resumen, detalle, creado, modificado) VALUES (?, ?, ?, ?, ?, ?)')
        .run(
          id,
          entrada.bovedaId,
          sellarJson(vk, resumen, `elemento:${id}:resumen`),
          sellarJson(vk, detalle, `elemento:${id}:detalle`),
          momento,
          momento
        )
      s.lista.set(id, this.aLista(this.fila(id), 0))
      return this.obtener(id)
    }

    const id = entrada.id
    const f = this.fila(id)
    const anteriorResumen = abrirJson<Resumen>(this.claveDe(f.boveda_id), f.resumen, `elemento:${id}:resumen`)
    const anteriorDetalle = this.detalleDe(f)

    transaccion(this.db, () => {
      if (f.boveda_id !== entrada.bovedaId) this.moverSinGuardar(id, f.boveda_id, entrada.bovedaId)
      const vk = this.claveDe(entrada.bovedaId)
      const cambiaContenido =
        JSON.stringify(anteriorDetalle) !== JSON.stringify(detalle) ||
        JSON.stringify({ ...anteriorResumen, favorito: false }) !== JSON.stringify({ ...resumen, favorito: false })
      // El favorito no cuenta como editar. Ya no se marca en CLAC, pero llega de
      // lo importado y viaja al exportar: se conserva sin dejar versión.
      // Guardar sin cambiar nada tampoco deja versión ni cambia la fecha.
      if (cambiaContenido) this.guardarVersion(id, entrada.bovedaId, anteriorResumen, anteriorDetalle)
      this.db
        .prepare('UPDATE elementos SET resumen = ?, detalle = ?, modificado = ? WHERE id = ?')
        .run(
          sellarJson(vk, resumen, `elemento:${id}:resumen`),
          sellarJson(vk, detalle, `elemento:${id}:detalle`),
          cambiaContenido ? momento : f.modificado,
          id
        )
    })
    s.lista.set(id, this.aLista(this.fila(id), this.adjuntosDe(id, entrada.bovedaId).length))
    return this.obtener(id)
  }

  private guardarVersion(id: string, bovedaId: string, resumen: Resumen, detalle: Detalle): void {
    const vid = nuevoId()
    this.db
      .prepare('INSERT INTO historial (id, elemento_id, fecha, datos) VALUES (?, ?, ?, ?)')
      .run(vid, id, ahora(), sellarJson(this.claveDe(bovedaId), { resumen, detalle }, `historial:${vid}:${id}`))
    // Se quedan las veinte últimas.
    this.db
      .prepare(
        `DELETE FROM historial WHERE elemento_id = ? AND id NOT IN (
           SELECT id FROM historial WHERE elemento_id = ? ORDER BY fecha DESC, rowid DESC LIMIT ${VERSIONES})`
      )
      .run(id, id)
  }

  historial(id: string): VersionHistorial[] {
    const f = this.fila(id)
    const vk = this.claveDe(f.boveda_id)
    const filas = this.db
      .prepare('SELECT id, fecha, datos FROM historial WHERE elemento_id = ? ORDER BY fecha DESC, rowid DESC')
      .all(id) as unknown as Array<{ id: string; fecha: string; datos: Uint8Array }>
    return filas.map((v) => {
      const { resumen, detalle } = abrirJson<{ resumen: Resumen; detalle: Detalle }>(vk, v.datos, `historial:${v.id}:${id}`)
      return { id: v.id, fecha: v.fecha, titulo: resumen.titulo, resumen, detalle }
    })
  }

  /** Vuelve a una versión anterior. Lo que había queda, a su vez, en el historial. */
  restaurarVersion(id: string, versionId: string): Elemento {
    const version = this.historial(id).find((v) => v.id === versionId)
    if (!version) throw new Error('Esa versión ya no está en el historial.')
    const actual = this.obtener(id)
    return this.guardar({
      id,
      bovedaId: actual.bovedaId,
      categoria: version.resumen.categoria,
      titulo: version.resumen.titulo,
      webs: version.resumen.webs,
      etiquetas: version.resumen.etiquetas,
      favorito: actual.favorito,
      secciones: version.detalle.secciones,
      notas: version.detalle.notas
    })
  }

  cambiarEstado(ids: string[], estado: EstadoElemento): void {
    const s = this.s()
    const momento = ahora()
    transaccion(this.db, () => {
      for (const id of ids) {
        this.db
          .prepare('UPDATE elementos SET estado = ?, eliminado = ? WHERE id = ?')
          .run(estado, estado === 'eliminado' ? momento : null, id)
      }
    })
    for (const id of ids) {
      const e = s.lista.get(id)
      if (e) s.lista.set(id, { ...e, estado, eliminadoEn: estado === 'eliminado' ? momento : null })
    }
  }

  /** Solo desde la papelera: lo que está activo o archivado se manda primero allí. */
  eliminarDefinitivamente(ids: string[]): number {
    const s = this.s()
    let n = 0
    transaccion(this.db, () => {
      for (const id of ids) {
        const r = this.db.prepare("DELETE FROM elementos WHERE id = ? AND estado = 'eliminado'").run(id)
        if (Number(r.changes) > 0) {
          n++
          s.lista.delete(id)
        }
      }
    })
    return n
  }

  vaciarPapelera(): number {
    return this.eliminarDefinitivamente(this.listar().filter((e) => e.estado === 'eliminado').map((e) => e.id))
  }

  /** Lo que lleva más de treinta días en la papelera se va solo al abrir. */
  purgarPapelera(hoy = new Date()): number {
    const limite = new Date(hoy.getTime() - DIAS_PAPELERA * 86_400_000).toISOString()
    const viejos = this.listar()
      .filter((e) => e.estado === 'eliminado' && e.eliminadoEn && e.eliminadoEn < limite)
      .map((e) => e.id)
    return viejos.length ? this.eliminarDefinitivamente(viejos) : 0
  }

  mover(ids: string[], bovedaId: string): void {
    this.claveDe(bovedaId)
    transaccion(this.db, () => {
      for (const id of ids) {
        const f = this.fila(id)
        if (f.boveda_id !== bovedaId) this.moverSinGuardar(id, f.boveda_id, bovedaId)
      }
    })
    const s = this.s()
    for (const id of ids) s.lista.set(id, this.aLista(this.fila(id), this.adjuntosDe(id, bovedaId).length))
  }

  /**
   * Pasar un elemento de una caja fuerte a otra es volver a cifrarlo todo con la
   * clave de la de destino: el elemento, su historial y sus adjuntos.
   */
  private moverSinGuardar(id: string, desde: string, hasta: string): void {
    const vieja = this.claveDe(desde)
    const nueva = this.claveDe(hasta)
    const f = this.fila(id)
    const recifrar = (sobre: Uint8Array, contexto: string): Buffer => sellar(nueva, abrir(vieja, sobre, contexto), contexto)

    this.db
      .prepare('UPDATE elementos SET boveda_id = ?, resumen = ?, detalle = ? WHERE id = ?')
      .run(hasta, recifrar(f.resumen, `elemento:${id}:resumen`), recifrar(f.detalle, `elemento:${id}:detalle`), id)

    const versiones = this.db.prepare('SELECT id, datos FROM historial WHERE elemento_id = ?').all(id) as unknown as Array<{
      id: string
      datos: Uint8Array
    }>
    for (const v of versiones) {
      this.db
        .prepare('UPDATE historial SET datos = ? WHERE id = ?')
        .run(recifrar(v.datos, `historial:${v.id}:${id}`), v.id)
    }

    const adjuntos = this.db.prepare('SELECT id, meta, datos FROM adjuntos WHERE elemento_id = ?').all(id) as unknown as Array<{
      id: string
      meta: Uint8Array
      datos: Uint8Array
    }>
    for (const a of adjuntos) {
      this.db
        .prepare('UPDATE adjuntos SET meta = ?, datos = ? WHERE id = ?')
        .run(recifrar(a.meta, `adjunto:${a.id}:meta`), recifrar(a.datos, `adjunto:${a.id}:datos`), a.id)
    }
  }

  duplicar(id: string): Elemento {
    const e = this.obtener(id)
    const copia = this.guardar({
      bovedaId: e.bovedaId,
      categoria: e.categoria,
      titulo: `${e.titulo} (copia)`,
      webs: e.webs,
      etiquetas: e.etiquetas,
      favorito: false,
      secciones: e.secciones.map((sec) => ({ ...sec, id: nuevoId(), campos: sec.campos.map((c) => ({ ...c, id: nuevoId() })) })),
      notas: e.notas
    })
    for (const a of e.adjuntosInfo) {
      const { datos } = this.leerAdjunto(a.id)
      this.anadirAdjunto(copia.id, a.nombre, a.tipo, datos)
    }
    return this.obtener(copia.id)
  }

  /** Se ha copiado o abierto algo suyo: para ordenar por uso y para el acceso rápido. */
  anotarUso(id: string): void {
    const s = this.s()
    const momento = ahora()
    this.db.prepare('UPDATE elementos SET usos = usos + 1, usado = ? WHERE id = ?').run(momento, id)
    const e = s.lista.get(id)
    if (e) s.lista.set(id, { ...e, usos: e.usos + 1, usado: momento })
  }

  /* ---------- Adjuntos ---------- */

  private adjuntosDe(elementoId: string, bovedaId: string): AdjuntoInfo[] {
    const vk = this.claveDe(bovedaId)
    const filas = this.db
      .prepare('SELECT id, meta, creado FROM adjuntos WHERE elemento_id = ? ORDER BY creado')
      .all(elementoId) as unknown as Array<{ id: string; meta: Uint8Array; creado: string }>
    return filas.map((a) => ({
      ...abrirJson<Omit<AdjuntoInfo, 'id' | 'creado'>>(vk, a.meta, `adjunto:${a.id}:meta`),
      id: a.id,
      creado: a.creado
    }))
  }

  anadirAdjunto(elementoId: string, nombre: string, tipo: string, datos: Buffer): AdjuntoInfo {
    if (datos.length > MAXIMO_ADJUNTO) {
      throw new Error(`«${nombre}» pasa de 50 MB, que es lo más que se guarda por archivo.`)
    }
    const f = this.fila(elementoId)
    const vk = this.claveDe(f.boveda_id)
    const id = nuevoId()
    const creado = ahora()
    const meta = { nombre, tipo, tamano: datos.length }
    this.db
      .prepare('INSERT INTO adjuntos (id, elemento_id, meta, datos, creado) VALUES (?, ?, ?, ?, ?)')
      .run(id, elementoId, sellarJson(vk, meta, `adjunto:${id}:meta`), sellar(vk, datos, `adjunto:${id}:datos`), creado)
    const e = this.s().lista.get(elementoId)
    if (e) this.s().lista.set(elementoId, { ...e, adjuntos: e.adjuntos + 1 })
    return { ...meta, id, creado }
  }

  leerAdjunto(id: string): { info: AdjuntoInfo; datos: Buffer } {
    const a = this.db
      .prepare('SELECT adjuntos.id, adjuntos.meta, adjuntos.datos, adjuntos.creado, elementos.boveda_id FROM adjuntos JOIN elementos ON elementos.id = adjuntos.elemento_id WHERE adjuntos.id = ?')
      .get(id) as unknown as { id: string; meta: Uint8Array; datos: Uint8Array; creado: string; boveda_id: string } | undefined
    if (!a) throw new Error('Ese archivo ya no está.')
    const vk = this.claveDe(a.boveda_id)
    return {
      info: { ...abrirJson<Omit<AdjuntoInfo, 'id' | 'creado'>>(vk, a.meta, `adjunto:${id}:meta`), id, creado: a.creado },
      datos: abrir(vk, a.datos, `adjunto:${id}:datos`)
    }
  }

  eliminarAdjunto(id: string): void {
    const a = this.db.prepare('SELECT elemento_id FROM adjuntos WHERE id = ?').get(id) as { elemento_id: string } | undefined
    if (!a) return
    this.db.prepare('DELETE FROM adjuntos WHERE id = ?').run(id)
    const e = this.s().lista.get(a.elemento_id)
    if (e) this.s().lista.set(a.elemento_id, { ...e, adjuntos: Math.max(0, e.adjuntos - 1) })
  }

  /* ---------- Para Watchtower y para exportar ---------- */

  todosConDetalle(): ParaRevisar[] {
    const s = this.s()
    const filas = this.db.prepare('SELECT * FROM elementos').all() as unknown as FilaElemento[]
    const salida: ParaRevisar[] = []
    for (const f of filas) {
      const elemento = s.lista.get(f.id)
      if (!elemento) continue
      salida.push({ elemento, detalle: this.detalleDe(f) })
    }
    return salida
  }

  /* ---------- Importar ---------- */

  /**
   * Mete lo importado en una caja fuerte, saltándose lo que ya estaba: mismo
   * tipo, mismo título, mismo usuario, misma contraseña y misma web. Importar
   * dos veces el mismo archivo no duplica nada.
   */
  importar(
    elementos: Importado[],
    bovedaId: string,
    adjuntos?: (ruta: string) => Buffer | null
  ): { nuevos: number; repetidos: number } {
    this.claveDe(bovedaId)
    const existentes = this.huellasExistentes()
    let nuevos = 0
    let repetidos = 0
    transaccion(this.db, () => {
      for (const imp of elementos) {
        const h = huellaImportable(imp.categoria, imp.titulo, imp, imp.webs)
        if (existentes.has(h)) {
          repetidos++
          continue
        }
        existentes.add(h)
        const e = this.guardar({
          bovedaId,
          categoria: imp.categoria,
          titulo: imp.titulo,
          webs: imp.webs,
          etiquetas: imp.etiquetas,
          favorito: imp.favorito,
          secciones: imp.secciones,
          notas: imp.notas
        })
        for (const a of imp.adjuntos ?? []) {
          const datos = adjuntos?.(a.ruta)
          if (datos) this.anadirAdjunto(e.id, a.nombre, tipoDeArchivo(a.nombre), datos)
        }
        if (imp.archivado) this.cambiarEstado([e.id], 'archivado')
        nuevos++
      }
    })
    return { nuevos, repetidos }
  }

  /** Cuántos de estos ya están, sin importar nada: para la vista previa. */
  contarRepetidos(elementos: Importado[]): number {
    const existentes = this.huellasExistentes()
    return elementos.filter((imp) => existentes.has(huellaImportable(imp.categoria, imp.titulo, imp, imp.webs))).length
  }

  private huellasExistentes(): Set<string> {
    return new Set(
      this.todosConDetalle()
        .filter((x) => x.elemento.estado !== 'eliminado')
        .map((x) => huellaImportable(x.elemento.categoria, x.elemento.titulo, x.detalle, x.elemento.webs))
    )
  }

  /* ---------- Comprobar un archivo ajeno ---------- */

  /**
   * Mira si un archivo es una caja fuerte de CLAC y, si se dan, si la
   * contraseña y la clave secreta la abren. Para restaurar una copia.
   */
  static examinar(ruta: string, contrasena?: string, secreto?: string): { idCuenta: string; abre: boolean | null } {
    let db: DatabaseSync | null = null
    /*
     * Se examina una copia y no el archivo. Abrirlo en solo lectura no vale: una
     * base en modo WAL necesita crear su `-shm` al lado aunque solo se lea, y la
     * copia puede estar en una memoria USB protegida o en una carpeta de sistema.
     */
    const temporal = join(tmpdir(), `clac-examen-${nuevoId()}.db`)
    try {
      copyFileSync(ruta, temporal)
      db = new Db(temporal)
      const leer = (clave: string): string | null =>
        (db!.prepare('SELECT valor FROM meta WHERE clave = ?').get(clave) as { valor: string } | undefined)?.valor ?? null
      const cuenta = leer('cuenta')
      const kdf = leer('kdf')
      const sobre = leer('claveCuenta')
      if (!cuenta || !kdf || !sobre) throw new Error('Ese archivo no es una caja fuerte de CLAC.')
      const idCuenta = (JSON.parse(cuenta) as Cuenta).id
      if (contrasena == null || secreto == null) return { idCuenta, abre: null }
      const auk = derivarClaveDesbloqueo(contrasena, secreto, idCuenta, JSON.parse(kdf) as ParametrosKdf)
      try {
        abrir(auk, Buffer.from(JSON.parse(sobre) as string, 'base64'), 'cuenta:clave').fill(0)
        return { idCuenta, abre: true }
      } catch {
        return { idCuenta, abre: false }
      } finally {
        auk.fill(0)
      }
    } catch (error) {
      if (error instanceof Error && /no es una caja fuerte/.test(error.message)) throw error
      throw new Error('Ese archivo no es una caja fuerte de CLAC, o está dañado.')
    } finally {
      db?.close()
      for (const sufijo of ['', '-wal', '-shm']) rmSync(temporal + sufijo, { force: true })
    }
  }
}

/** Lo que hace que dos elementos sean «el mismo» al importar. */
function huellaImportable(cat: string, titulo: string, detalle: Pick<Detalle, 'secciones'>, webs: string[]): string {
  return [cat, titulo.trim().toLowerCase(), usuarioDe(detalle), contrasenaDe(detalle), dominioDe(webs[0] ?? '')].join('')
}

/* ---------- Ayudantes ---------- */

export function comprobarContrasenaNueva(contrasena: string): void {
  if (contrasena.trim().length < MINIMO_CONTRASENA) {
    throw new Error(`La contraseña maestra tiene que tener al menos ${MINIMO_CONTRASENA} caracteres.`)
  }
}

/** Quita las secciones añadidas que se han quedado vacías y pone ids donde falten. */
function limpiarSecciones(secciones: Seccion[]): Seccion[] {
  return secciones
    .map((s, i) => ({
      id: s.id || nuevoId(),
      titulo: i === 0 ? '' : s.titulo.trim(),
      campos: s.campos.map((c) => ({
        id: c.id || nuevoId(),
        ...(c.clave ? { clave: c.clave } : {}),
        etiqueta: c.etiqueta.trim() || 'Campo',
        tipo: c.tipo,
        valor: c.valor
      }))
    }))
    .filter((s, i) => i === 0 || s.campos.length > 0 || s.titulo !== '')
}

const TIPOS_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  json: 'application/json',
  zip: 'application/zip'
}

export function tipoDeArchivo(nombre: string): string {
  const ext = nombre.split('.').pop()?.toLowerCase() ?? ''
  return TIPOS_MIME[ext] ?? 'application/octet-stream'
}

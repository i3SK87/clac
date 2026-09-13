/**
 * Quien tiene la caja fuerte en la mano, y avisa a las ventanas cuando cambia.
 *
 * La caja es una sola, la usan dos ventanas —la principal y el acceso rápido—
 * y la bloquean tres cosas distintas (el botón, el atajo y el temporizador).
 * Todas pasan por aquí, y aquí se decide qué ve cada una.
 */
import { app, BrowserWindow } from 'electron'
import { existsSync, renameSync, rmSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CajaFuerte, ErrorContrasena } from './boveda/boveda'
import { NOMBRE_ARCHIVO, copiarEnCarpeta, hacerCopia } from './boveda/db'
import { guardarAjustes, leerAjustes } from './boveda/ajustes'
import { guardarClaveLocal, leerClaveLocal } from './claveLocal'
import { vaciarSiEsNuestro } from './portapapeles'
import { registrar, registrarFallo } from './registro'
import { pedirHello } from './ayudante'
import { anotarMaestra, guardarClave, hayClave, marcarEsperando, motivoHello, olvidarClave, sacarClave } from './hello'
import { leerClave, nuevaClaveSecreta, nuevoIdCuenta, formatearClave, type ClaveSecreta } from '@shared/claveSecreta'
import type { Ajustes, EstadoSesion } from '@shared/tipos'

let caja: CajaFuerte | null = null
let carpeta = ''

export function iniciarServicio(): void {
  carpeta = app.getPath('userData')
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true })
  caja = new CajaFuerte(carpeta)
}

export function laCaja(): CajaFuerte {
  if (!caja) throw new Error('La caja fuerte no está cargada.')
  return caja
}

export function carpetaDatos(): string {
  return carpeta
}

/** A todas las ventanas abiertas. */
export function avisar(canal: string, ...datos: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(canal, ...datos)
  }
}

export function estadoSesion(): EstadoSesion {
  const c = laCaja()
  if (!c.existe()) return 'nueva'
  if (c.abierta()) return 'abierta'
  return leerClaveLocal(c.idCuenta()) ? 'bloqueada' : 'sinClave'
}

function cambio(): void {
  avisar('sesion:cambio', estadoSesion())
}

export function ajustes(): Ajustes {
  return leerAjustes(laCaja().db)
}

export function cambiarAjustes(cambios: Partial<Ajustes>): Ajustes {
  const nuevos = guardarAjustes(laCaja().db, cambios)
  if (!nuevos.windowsHello) olvidarClave()
  avisar('ajustes:cambio', nuevos)
  return nuevos
}

/** Crea la caja fuerte y devuelve la clave secreta, escrita para enseñarla. */
export function crearCaja(contrasena: string): string {
  const clave = nuevaClaveSecreta(nuevoIdCuenta())
  laCaja().crear(contrasena, clave)
  guardarClaveLocal(clave)
  anotarMaestra()
  registrar('sesión', 'caja fuerte creada')
  cambio()
  return formatearClave(clave)
}

/**
 * Desbloquea. La clave secreta sale de este equipo; solo si no está —se ha
 * traído la carpeta de otro ordenador— hay que escribirla, y entonces se guarda
 * para la próxima.
 */
export function desbloquear(contrasena: string, claveEscrita?: string): void {
  const c = laCaja()
  let clave: ClaveSecreta | null = leerClaveLocal(c.idCuenta())
  let escrita = false
  if (!clave) {
    if (!claveEscrita) throw new Error('Falta la clave secreta de este equipo. Escríbela del kit de emergencia.')
    const leida = leerClave(claveEscrita)
    if ('error' in leida) throw new Error(leida.error)
    if (leida.clave.idCuenta !== c.idCuenta()) {
      throw new Error(
        `Esa clave secreta es de otra caja fuerte (la suya es ${leida.clave.idCuenta} y esta es ${c.idCuenta()}).`
      )
    }
    clave = leida.clave
    escrita = true
  }
  c.desbloquear(contrasena, clave.secreto)
  if (escrita) guardarClaveLocal(clave)
  anotarMaestra()
  olvidarClave()
  registrar('sesión', 'desbloqueada')
  cambio()
}

/** Si la próxima vez se podrá entrar con Windows Hello, para enseñar el botón. */
export function estadoHelloSesion(): { activo: boolean; listo: boolean } {
  const activo = ajustes().windowsHello
  return { activo, listo: activo && hayClave() }
}

/**
 * Desbloquea con Windows Hello. `ventana` es sobre qué ventana sale el
 * diálogo; 0, la que esté delante (lo pide la extensión, y delante está el
 * navegador).
 */
export async function desbloquearConHello(ventana: bigint): Promise<void> {
  const c = laCaja()
  if (c.abierta()) return
  if (!estadoHelloSesion().listo) throw new Error('Esta vez hace falta la contraseña maestra.')
  marcarEsperando(true)
  let resultado: string | null
  try {
    resultado = await pedirHello('Desbloquear CLAC', ventana)
  } finally {
    marcarEsperando(false)
  }
  if (resultado === 'RetriesExhausted') olvidarClave()
  if (resultado !== 'Verified') throw new Error(motivoHello(resultado))
  // Mientras Windows preguntaba, se ha podido abrir con la contraseña.
  if (c.abierta()) return
  const clave = sacarClave()
  if (!clave) throw new Error('Esta vez hace falta la contraseña maestra.')
  try {
    c.desbloquearConClaveCuenta(clave)
  } finally {
    clave.fill(0)
  }
  olvidarClave()
  registrar('sesión', 'desbloqueada con Windows Hello')
  cambio()
}

export function bloquear(motivo: string): void {
  const c = laCaja()
  if (!c.abierta()) return
  // Para Windows Hello, la clave de la cuenta se queda en memoria y cifrada.
  if (ajustes().windowsHello) guardarClave(c.copiaClaveCuenta())
  c.bloquear()
  // Lo copiado de la caja no se queda en el portapapeles con la caja cerrada.
  vaciarSiEsNuestro()
  registrar('sesión', `bloqueada (${motivo})`)
  cambio()
}

export function claveDeEsteEquipo(): ClaveSecreta {
  const c = laCaja()
  const clave = leerClaveLocal(c.idCuenta())
  if (!clave) throw new Error('Falta la clave secreta de este equipo.')
  return clave
}

/** Vuelve a pedir la contraseña para lo delicado. */
export function exigirContrasena(contrasena: string): ClaveSecreta {
  const clave = claveDeEsteEquipo()
  if (!laCaja().comprobarContrasena(contrasena, clave.secreto)) throw new ErrorContrasena()
  return clave
}

export function hacerCopiaAhora(): string {
  const destino = hacerCopia(laCaja().db, carpeta)
  cambiarAjustes({ ultimaCopia: new Date().toISOString() })
  copiaExtra()
  return destino
}

let falloExtra: string | null = null

export function falloCopiaExtra(): string | null {
  return falloExtra
}

/**
 * La misma copia, también en la otra carpeta si se ha elegido. Va cifrada, así
 * que puede estar en la nube. Si falla —la carpeta ya no existe, OneDrive sin
 * sitio—, se apunta y se enseña en Ajustes, pero la copia de siempre ya está
 * hecha.
 */
function copiaExtra(): void {
  const dir = ajustes().carpetaCopiaExtra
  if (!dir) return
  try {
    copiarEnCarpeta(laCaja().db, dir, 10)
    falloExtra = null
    cambiarAjustes({ ultimaCopiaExtra: new Date().toISOString() })
  } catch (error) {
    falloExtra = error instanceof Error ? error.message : String(error)
    registrarFallo('copia en la otra carpeta', error)
  }
}

/**
 * La copia del día, si aún no hay. Se mira cada media hora y al salir: antes
 * solo se hacía al salir, y con CLAC viviendo en la bandeja se salía poco.
 * No hace falta que la caja esté abierta: se copia el archivo, cifrado.
 */
export function copiaDelDia(): void {
  try {
    const c = laCaja()
    if (!c.existe()) return
    const ultima = ajustes().ultimaCopia
    if (ultima && ultima.slice(0, 10) === new Date().toISOString().slice(0, 10)) return
    hacerCopiaAhora()
    registrar('copia', 'la del día')
  } catch (error) {
    registrarFallo('copia del día', error)
  }
}

/**
 * Sustituye la caja fuerte por una copia.
 *
 * La de ahora no se borra: se aparta a `copias` con otro nombre, por si la
 * copia resultara no ser la que se quería.
 */
export function restaurarCopia(ruta: string, contrasena: string, claveEscrita: string): void {
  const leida = leerClave(claveEscrita)
  if ('error' in leida) throw new Error(leida.error)
  const examen = CajaFuerte.examinar(ruta, contrasena, leida.clave.secreto)
  if (examen.idCuenta !== leida.clave.idCuenta) {
    throw new Error(`Esa clave secreta es de otra caja fuerte (la copia es de la ${examen.idCuenta}).`)
  }
  if (!examen.abre) throw new ErrorContrasena()

  const actual = join(carpeta, NOMBRE_ARCHIVO)
  const tenia = laCaja().existe()
  olvidarClave()
  laCaja().cerrar()
  if (tenia && existsSync(actual)) {
    const dir = join(carpeta, 'copias')
    mkdirSync(dir, { recursive: true })
    const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    renameSync(actual, join(dir, `antes-de-restaurar-${sello}.db`))
  }
  for (const sufijo of ['', '-wal', '-shm']) rmSync(actual + sufijo, { force: true })
  copyFileSync(ruta, actual)
  caja = new CajaFuerte(carpeta)
  guardarClaveLocal(leida.clave)
  caja.desbloquear(contrasena, leida.clave.secreto)
  anotarMaestra()
  registrar('sesión', 'copia restaurada')
  cambio()
}

export function cerrarServicio(): void {
  try {
    const c = laCaja()
    // La copia del día, al salir, si no se ha hecho ya. Va cifrada: es el archivo tal cual.
    if (c.existe()) copiaDelDia()
  } catch {
    // Si la copia falla, no se impide salir.
  }
  olvidarClave()
  caja?.cerrar()
  caja = null
}

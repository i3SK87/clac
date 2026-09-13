/**
 * La parte de CLAC que habla con el navegador.
 *
 * Dos cosas:
 *
 * 1. **Darse de alta** para que el navegador sepa a quién llamar. Se escriben
 *    en `%APPDATA%\CLAC\navegador` el puente, el .cmd que lo arranca y el
 *    manifiesto que dice qué extensión puede usarlo (solo la nuestra, por su
 *    identificador), y se apunta ese manifiesto en el registro de Windows del
 *    usuario, en la clave que leen Chrome, Opera y Brave, y en la de Edge.
 *    Se hace con `reg.exe`: sin módulos nativos.
 *
 * 2. **Escuchar** en un canal con nombre de Windows, que solo es de este usuario.
 *    El puente entra por ahí, una línea por mensaje. En la puerta está el
 *    portero (`portero.ts`): solo deja pasar al CLAC.exe de esta instalación
 *    cuando lo ha abierto un navegador.
 *
 * Todo esto solo existe con el ajuste encendido. Apagarlo borra las claves del
 * registro y cierra el canal.
 */
import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import anfitrion from './anfitrion.cjs?raw'
import { atender, type Piezas } from './protocolo'
import { NOMBRE_ANFITRION, type Peticion } from '@shared/navegador'
import { registrar, registrarFallo } from '../registro'
import { arrancarPortero, type Portero } from './portero'
import type { InfoNavegador } from '@shared/tipos'

const ejecutar = promisify(execFile)

/**
 * El identificador de la extensión. Sale de la clave pública que lleva su
 * manifiesto (`extension/manifest.json`, campo `key`), así que es siempre el
 * mismo, se cargue desde la carpeta que se cargue.
 */
export const ID_EXTENSION = 'enbgijpmdefhfcgfnbmplchdccgcmccd'

const CLAVES = [
  `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NOMBRE_ANFITRION}`,
  `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NOMBRE_ANFITRION}`
]

export const TUBO = `\\\\.\\pipe\\clac-navegador-${String(process.env.USERNAME || 'usuario').toLowerCase()}`

let portero: Portero | null = null
let ultimaConexion: string | null = null
/** Reintentos si el portero se cae, para no quedarse arrancándolo en bucle. */
let reintentos = 0

function carpetaPuente(): string {
  return join(app.getPath('userData'), 'navegador')
}

/** Donde está la extensión lista para cargar: dentro de la instalación, o en el proyecto. */
export function carpetaExtension(): string {
  return app.isPackaged ? join(process.resourcesPath, 'extension') : join(app.getAppPath(), 'extension', 'dist')
}

function escribirPuente(): string {
  const dir = carpetaPuente()
  mkdirSync(dir, { recursive: true })
  const script = join(dir, 'clac-anfitrion.cjs')
  const cmd = join(dir, 'clac-anfitrion.cmd')
  const manifiesto = join(dir, `${NOMBRE_ANFITRION}.json`)

  writeFileSync(script, anfitrion)
  // En desarrollo, CLAC.exe es el Electron del proyecto y hay que decirle qué abrir.
  writeFileSync(
    join(dir, 'lanzar.json'),
    JSON.stringify({ exe: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] }, null, 2)
  )
  writeFileSync(
    cmd,
    ['@echo off', 'setlocal', 'set ELECTRON_RUN_AS_NODE=1', `"${process.execPath}" "${script}" %*`, ''].join('\r\n')
  )
  writeFileSync(
    manifiesto,
    JSON.stringify(
      {
        name: NOMBRE_ANFITRION,
        description: 'CLAC, gestor de contraseñas',
        path: cmd,
        type: 'stdio',
        allowed_origins: [`chrome-extension://${ID_EXTENSION}/`]
      },
      null,
      2
    )
  )
  return manifiesto
}

async function darDeAlta(): Promise<void> {
  const manifiesto = escribirPuente()
  for (const clave of CLAVES) {
    await ejecutar('reg.exe', ['add', clave, '/ve', '/t', 'REG_SZ', '/d', manifiesto, '/f'], { windowsHide: true })
  }
}

async function darDeBaja(): Promise<void> {
  for (const clave of CLAVES) {
    await ejecutar('reg.exe', ['delete', clave, '/f'], { windowsHide: true }).catch(() => undefined)
  }
}

async function registrado(): Promise<boolean> {
  try {
    const { stdout } = await ejecutar('reg.exe', ['query', CLAVES[0], '/ve'], { windowsHide: true })
    return stdout.includes(join(carpetaPuente(), `${NOMBRE_ANFITRION}.json`))
  } catch {
    return false
  }
}

function escuchar(piezas: Piezas): void {
  if (portero) return
  const este = arrancarPortero({
    tubo: TUBO,
    exe: process.execPath,
    alPedir: async (linea) => {
      let peticion: Peticion
      try {
        peticion = JSON.parse(linea) as Peticion
      } catch {
        return JSON.stringify({ id: 0, ok: false, error: 'Mensaje ilegible.' })
      }
      return JSON.stringify(await atender(peticion, piezas))
    },
    alAbrir: () => {
      ultimaConexion = new Date().toISOString()
      reintentos = 0
    },
    alRechazar: (pid, motivo) => registrar('navegador', `rechazada una conexión (proceso ${pid}): ${motivo}`),
    alFallar: (mensaje) => {
      registrar('navegador', `portero: ${mensaje}`)
      if (!/se ha cerrado/.test(mensaje) || portero !== este) return
      portero = null
      if (reintentos++ < 5) setTimeout(() => escuchar(piezas), 3000 * reintentos)
    }
  })
  portero = este
}

function dejarDeEscuchar(): void {
  portero?.parar()
  portero = null
}

/**
 * Pone la conexión como diga el ajuste. Al arrancar se vuelve a escribir todo,
 * para que el registro apunte siempre al CLAC.exe de ahora, aunque la aplicación
 * se haya actualizado o movido de sitio.
 */
export async function aplicarNavegador(activo: boolean, piezas: Piezas): Promise<void> {
  try {
    if (activo) {
      await darDeAlta()
      escuchar(piezas)
    } else {
      dejarDeEscuchar()
      await darDeBaja()
    }
  } catch (error) {
    registrarFallo('navegador', error)
  }
}

export async function infoNavegador(activo: boolean): Promise<InfoNavegador> {
  return {
    activo,
    carpetaExtension: carpetaExtension(),
    idExtension: ID_EXTENSION,
    registrado: activo ? await registrado() : false,
    ultimaConexion
  }
}

export function pararNavegador(): void {
  dejarDeEscuchar()
}

export function hayExtension(): boolean {
  return existsSync(join(carpetaExtension(), 'manifest.json'))
}


import { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, nativeTheme, shell } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ajustes,
  bloquear,
  cerrarServicio,
  desbloquear,
  estadoSesion,
  iniciarServicio,
  laCaja
} from './servicio'
import { registrarIpc } from './ipc'
import { vigilarBloqueo } from './bloqueo'
import { alternarAcceso, destruirAcceso } from './acceso'
import { aplicarArranque, arrancoOculta } from './autostart'
import { pararAyudante, precalentar } from './ayudante'
import { copiar, vaciarSiEsNuestro } from './portapapeles'
import { aplicarNavegador, pararNavegador } from './navegador/conexion'
import type { Piezas } from './navegador/protocolo'
import { registrar, registrarFallo } from './registro'
import type { Ajustes } from '@shared/tipos'

let ventana: BrowserWindow | null = null
let bandeja: Tray | null = null
/** Distingue cerrar la ventana de salir de verdad: lo primero solo la esconde. */
let saliendo = false

const isDev = !app.isPackaged
const APP_ID = 'com.clac.desktop'
const rutaIcono = join(__dirname, '../../resources/icon.ico')
const rutaPng = join(__dirname, '../../resources/icon.png')
const icono = existsSync(rutaIcono) ? rutaIcono : undefined

/** El color de fondo de la ventana nativa, el mismo que pinta la hoja al arrancar. */
function fondo(): string {
  return nativeTheme.shouldUseDarkColors ? '#14161a' : '#f2f3f7'
}

function crearVentana(): void {
  ventana = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: fondo(),
    title: 'CLAC',
    ...(icono ? { icon: icono } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  ventana.on('ready-to-show', () => {
    if (!arrancoOculta()) ventana?.show()
  })

  ventana.on('close', (evento) => {
    if (saliendo || !ajustes().cerrarABandeja) return
    evento.preventDefault()
    ventana?.hide()
  })

  ventana.on('closed', () => {
    ventana = null
    if (!saliendo) {
      saliendo = true
      app.quit()
    }
  })

  // Nada se abre dentro: los enlaces van al navegador, y la ventana no navega.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (isDev && process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)) return
    evento.preventDefault()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void ventana.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void ventana.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function mostrarVentana(): void {
  if (!ventana || ventana.isDestroyed()) {
    crearVentana()
    ventana?.once('ready-to-show', () => ventana?.show())
    return
  }
  if (ventana.isMinimized()) ventana.restore()
  ventana.show()
  ventana.focus()
}

function salir(): void {
  saliendo = true
  app.quit()
}

function crearBandeja(): void {
  bandeja = new Tray(icono ? nativeImage.createFromPath(icono) : nativeImage.createEmpty())
  bandeja.setToolTip('CLAC')
  const menu = (): Menu =>
    Menu.buildFromTemplate([
      { label: 'Abrir CLAC', click: mostrarVentana },
      { label: 'Acceso rápido', accelerator: 'CommandOrControl+Shift+Space', click: abrirAcceso },
      { type: 'separator' },
      {
        label: 'Bloquear',
        enabled: estadoSesion() === 'abierta',
        click: () => bloquear('bandeja')
      },
      { type: 'separator' },
      { label: 'Salir', click: salir }
    ])
  bandeja.setContextMenu(menu())
  // El menú se rehace al abrirlo, para que «Bloquear» diga la verdad.
  bandeja.on('right-click', () => bandeja?.setContextMenu(menu()))
  bandeja.on('click', mostrarVentana)
  bandeja.on('double-click', mostrarVentana)
}

function abrirAcceso(): void {
  alternarAcceso(isDev, icono, fondo())
}

function construirMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Archivo',
        submenu: [
          { label: 'Nuevo elemento', accelerator: 'CmdOrCtrl+N', click: () => ventana?.webContents.send('menu', 'nuevo') },
          { label: 'Importar…', click: () => ventana?.webContents.send('menu', 'importar') },
          { type: 'separator' },
          { label: 'Bloquear', click: () => bloquear('menú') },
          { type: 'separator' },
          { label: 'Salir', click: salir }
        ]
      },
      {
        // Sin atajos propios: copiar y pegar en los campos ya lo hace Chromium, y
        // Ctrl+C sobre un elemento es de la aplicación (copia el usuario).
        label: 'Ver',
        submenu: [
          { label: 'Acercar', role: 'zoomIn' },
          { label: 'Alejar', role: 'zoomOut' },
          { label: 'Tamaño normal', role: 'resetZoom' },
          ...(isDev
            ? [
                { type: 'separator' as const },
                { label: 'Recargar', role: 'reload' as const },
                { label: 'Herramientas de desarrollo', role: 'toggleDevTools' as const }
              ]
            : [])
        ]
      }
    ])
  )
}

/** Los atajos de todo el sistema. Se rehacen al cambiar el ajuste. */
function registrarAtajos(a: Ajustes): void {
  globalShortcut.unregisterAll()
  if (a.accesoRapido) {
    const ok = globalShortcut.register('CommandOrControl+Shift+Space', abrirAcceso)
    if (!ok) registrar('atajos', 'Ctrl+Mayús+Espacio lo tiene otra aplicación')
  }
  globalShortcut.register('CommandOrControl+Shift+L', () => bloquear('atajo'))
}

/** Lo que la extensión del navegador puede pedirle a CLAC. */
const piezasNavegador: Piezas = {
  caja: laCaja,
  estado: estadoSesion,
  ajustes,
  version: app.getVersion(),
  desbloquear: (contrasena) => desbloquear(contrasena),
  copiar: (texto) => copiar(texto, ajustes().portapapelesSegundos),
  abrirElemento: (id) => {
    mostrarVentana()
    ventana?.webContents.send('abrir:elemento', id)
  }
}

/** Lo último que se aplicó del navegador: no se reescribe el registro en cada ajuste. */
let navegadorAplicado: boolean | null = null

function alCambiarAjustes(a: Ajustes): void {
  nativeTheme.themeSource = a.theme
  registrarAtajos(a)
  aplicarArranque(a.arrancarConWindows)
  if (a.navegador !== navegadorAplicado) {
    // Apagado desde siempre, no hay nada que borrar del registro al arrancar.
    const antes = navegadorAplicado
    navegadorAplicado = a.navegador
    if (a.navegador || antes !== null) void aplicarNavegador(a.navegador, piezasNavegador)
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', mostrarVentana)

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID)
    try {
      iniciarServicio()
    } catch (error) {
      registrarFallo('arranque', error)
      throw error
    }

    const iconoPng = existsSync(rutaPng) ? `data:image/png;base64,${readFileSync(rutaPng).toString('base64')}` : ''
    registrarIpc({
      ventanaPrincipal: () => (ventana && !ventana.isDestroyed() ? ventana : null),
      iconoPng,
      mostrarPrincipal: mostrarVentana,
      alCambiarAjustes
    })

    alCambiarAjustes(ajustes())
    construirMenu()
    crearBandeja()
    crearVentana()
    vigilarBloqueo(ajustes, () => laCaja().abierta(), bloquear)
    // PowerShell tarda en arrancar en frío: se deja listo antes de la primera copia.
    setTimeout(precalentar, 3000)
    registrar('arranque', `CLAC ${app.getVersion()}`)
  })

  app.on('window-all-closed', () => {
    // Con la bandeja y el acceso rápido, cerrar la ventana no es salir.
    if (saliendo) app.quit()
  })

  app.on('before-quit', () => {
    saliendo = true
    globalShortcut.unregisterAll()
    vaciarSiEsNuestro()
    pararNavegador()
    destruirAcceso()
    pararAyudante()
    cerrarServicio()
  })
}

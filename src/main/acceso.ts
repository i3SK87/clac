/**
 * El acceso rápido: el buscador flotante de Ctrl+Mayús+Espacio.
 *
 * Una ventana sin marco, encima de todo, que aparece donde estés, busca, copia
 * y se va. Se crea una vez y se esconde en vez de cerrarse, para que salga al
 * instante. Nunca tiene los secretos: pide al proceso principal que copie, y es
 * él quien descifra y deja la contraseña en el portapapeles.
 */
import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { helloEsperando } from './hello'

let ventana: BrowserWindow | null = null

const ANCHO = 640
const ALTO = 440

function crear(isDev: boolean, icono: string | undefined, fondo: string): BrowserWindow {
  const w = new BrowserWindow({
    width: ANCHO,
    height: ALTO,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: fondo,
    title: 'Acceso rápido de CLAC',
    ...(icono ? { icon: icono } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  w.setAlwaysOnTop(true, 'pop-up-menu')
  // Al perder el foco se va: es un buscador de paso, no una ventana más. Salvo
  // si lo que se lo ha llevado es el diálogo de Windows Hello que ha pedido él.
  w.on('blur', () => {
    if (!w.webContents.isDevToolsOpened() && !helloEsperando()) w.hide()
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}/acceso.html`)
  } else {
    void w.loadFile(join(__dirname, '../renderer/acceso.html'))
  }
  return w
}

/** Lo enseña en la pantalla donde está el ratón, a un tercio de altura. */
export function alternarAcceso(isDev: boolean, icono: string | undefined, fondo: string): void {
  if (!ventana || ventana.isDestroyed()) ventana = crear(isDev, icono, fondo)
  const w = ventana
  if (w.isVisible()) {
    w.hide()
    return
  }
  const pantalla = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  w.setBounds({
    x: Math.round(pantalla.x + (pantalla.width - ANCHO) / 2),
    y: Math.round(pantalla.y + pantalla.height / 4),
    width: ANCHO,
    height: ALTO
  })
  const mostrar = (): void => {
    w.show()
    w.focus()
    w.webContents.send('acceso:mostrado')
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', mostrar)
  else mostrar()
}

export function ocultarAcceso(): void {
  if (ventana && !ventana.isDestroyed()) ventana.hide()
}

export function ventanaAcceso(): BrowserWindow | null {
  return ventana && !ventana.isDestroyed() ? ventana : null
}

export function destruirAcceso(): void {
  if (ventana && !ventana.isDestroyed()) ventana.destroy()
  ventana = null
}

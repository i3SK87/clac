// Las capturas del tutorial, con datos de ejemplo y sin abrir nada en pantalla:
// cada una en una ventana fuera de pantalla (offscreen), un proceso por captura
// (en un mismo proceso la segunda ventana fuera de pantalla no llega a cargar).
//
//   node_modules\electron\dist\electron.exe docs\tutorial\retratar.cjs --escena=t05
//   (o todas: node docs/tutorial/capturar.mjs)
const { app, BrowserWindow, ipcMain } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const RAIZ = join(__dirname, '..', '..')
const APP = join(RAIZ, 'out', 'renderer')
const EXT = join(RAIZ, 'extension', 'dist')

const ESCENAS = [
  { nombre: 't01-bienvenida', html: 'index.html', sesion: 'nueva', w: 1000, h: 620, pasos: [] },
  {
    nombre: 't02-contrasena', html: 'index.html', sesion: 'nueva', w: 1000, h: 700,
    pasos: [['pulsar', '.puerta-boton', 'Crear'], ['escribir', '#nueva-pw', 'Farola-Tortuga-Queso-Lento-Pino'], ['escribir', '#nueva-pw-2', 'Farola-Tortuga-Queso-Lento-Pino']]
  },
  {
    nombre: 't03-clave', html: 'index.html', sesion: 'nueva', w: 1000, h: 640,
    pasos: [['pulsar', '.puerta-boton', 'Crear'], ['escribir', '#nueva-pw', 'Farola-Tortuga-Queso-Lento-Pino'], ['escribir', '#nueva-pw-2', 'Farola-Tortuga-Queso-Lento-Pino'], ['pulsar', '.btn.primary', 'Crear la caja fuerte']]
  },
  { nombre: 't04-bloqueo', html: 'index.html', sesion: 'bloqueada', w: 1000, h: 560, pasos: [] },
  { nombre: 't05-caja', html: 'index.html', w: 1180, h: 740, pasos: [['pulsar', '.fila-elemento', 'Google']] },
  { nombre: 't06-nuevo', html: 'index.html', w: 1180, h: 740, pasos: [['pulsar', '.topbar .btn.primary', 'Nuevo']] },
  {
    nombre: 't07-editor', html: 'index.html', w: 1180, h: 900,
    pasos: [['pulsar', '.fila-elemento', 'Google'], ['pulsar', '.detalle-botones .btn', 'Editar'], ['pulsar', '[aria-label="Generar una contraseña"]']]
  },
  { nombre: 't08-generador', html: 'index.html', w: 1180, h: 560, pasos: [['pulsar', '.nav-item', 'Generador']] },
  { nombre: 't09-acceso', html: 'acceso.html', w: 640, h: 440, pasos: [] },
  { nombre: 't10-watchtower', html: 'index.html', w: 1180, h: 900, pasos: [['pulsar', '.nav-item', 'Watchtower']] },
  { nombre: 't11-ajustes', html: 'index.html', w: 1180, h: 1500, pasos: [['pulsar', '.nav-item', 'Ajustes']] },
  {
    nombre: 't12-importar', html: 'index.html', w: 1180, h: 760,
    pasos: [['pulsar', '.nav-item', 'Ajustes'], ['pulsar', '.btn', 'Importar contraseñas'], ['pulsar', '.modal .btn.primary', 'Elegir el archivo']]
  },
  { nombre: 'p01-extension', popup: true, estado: 'abierta', w: 370, h: 420, pasos: [] },
  { nombre: 'p02-extension-aviso', popup: true, estado: 'abierta', w: 370, h: 470, pasos: [['pulsar', '.ext-fila', 'Banco Ejemplo']] },
  { nombre: 'p03-extension-generar', popup: true, estado: 'abierta', w: 370, h: 300, pasos: [['pulsar', '.ext-pie .btn', 'Generar']] }
]

const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const cual = process.argv.find((a) => a.startsWith('--escena='))?.split('=')[1]

app.whenReady().then(async () => {
  const e = ESCENAS.find((x) => x.nombre.startsWith(cual))
  if (!e) return app.quit()
  const w = new BrowserWindow({
    width: e.w,
    height: e.h,
    show: false,
    frame: false,
    webPreferences: e.popup
      ? { offscreen: true, contextIsolation: false, sandbox: false, preload: join(__dirname, 'popup-falso.cjs'), additionalArguments: [`--estado=${e.estado}`, '--tema=light'] }
      : { offscreen: true, contextIsolation: true, sandbox: false, preload: join(__dirname, 'falso.cjs'), additionalArguments: [`--sesion=${e.sesion ?? 'abierta'}`, '--tema=light', '--paleta=grafito'] }
  })
  w.webContents.setFrameRate(10)
  let ultima = null
  w.webContents.on('paint', (_ev, _s, img) => {
    if (!img.isEmpty()) ultima = img
  })
  await w.loadFile(e.popup ? join(EXT, 'popup.html') : join(APP, e.html))
  await espera(900)
  for (const [accion, selector, valor] of e.pasos) {
    const hecho = new Promise((r) => ipcMain.once('pulsado', (_x, ok) => r(ok)))
    w.webContents.send(accion, selector, valor)
    if (!(await hecho)) console.log(`  ${e.nombre}: no encontré ${selector} «${valor ?? ''}»`)
    await espera(550)
  }
  w.webContents.invalidate()
  await espera(700)
  if (ultima) writeFileSync(join(__dirname, 'capturas', `${e.nombre}.png`), ultima.toPNG())
  console.log(e.nombre, ultima ? 'ok' : 'SIN IMAGEN')
  app.quit()
})

module.exports = { ESCENAS }

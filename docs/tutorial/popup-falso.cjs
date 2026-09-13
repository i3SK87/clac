// Finge las APIs de extensión de Chromium para retratar la ventana de la
// extensión con datos de ejemplo.
const { ipcRenderer } = require('electron')
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1]
const ESTADO = arg('estado', 'abierta')
const TEMA = arg('tema', 'dark')

const elementos = [
  { id: 'g', titulo: 'Google', usuario: 'ana.garcia.ejemplo@gmail.com', web: 'https://accounts.google.com', categoria: 'login', coincide: true, tieneTotp: true, tieneContrasena: true },
  { id: 'g2', titulo: 'Google (trabajo)', usuario: 'ana@empresa-ejemplo.es', web: 'https://accounts.google.com', categoria: 'login', coincide: true, tieneTotp: false, tieneContrasena: true },
  { id: 'b', titulo: 'Banco Ejemplo', usuario: '12345678Z', web: 'https://www.bancoejemplo.es', categoria: 'login', coincide: false, tieneTotp: false, tieneContrasena: true },
  { id: 'h', titulo: 'GitHub', usuario: 'anagarcia-dev', web: 'https://github.com', categoria: 'login', coincide: false, tieneTotp: true, tieneContrasena: true }
]

function responder(p) {
  if (ESTADO === 'cerrada') return { id: p.id, ok: false, cerrada: true, error: 'CLAC no está abierta.' }
  switch (p.tipo) {
    case 'estado': return { id: p.id, ok: true, datos: { sesion: ESTADO, tema: TEMA, paleta: 'grafito', version: '1.1.0' } }
    case 'buscar': return { id: p.id, ok: true, datos: p.consulta ? elementos.filter((e) => e.titulo.toLowerCase().includes(p.consulta.toLowerCase())) : elementos }
    default: return { id: p.id, ok: true, datos: null }
  }
}

const port = {
  _oyentes: [], _cortes: [],
  onMessage: { addListener(f) { port._oyentes.push(f) } },
  onDisconnect: { addListener(f) { port._cortes.push(f) } },
  postMessage(p) {
    setTimeout(() => {
      if (ESTADO === 'sinpuente') {
        window.chrome.runtime.lastError = { message: 'Specified native messaging host not found.' }
        port._cortes.forEach((f) => f())
        return
      }
      port._oyentes.forEach((f) => f(responder(p)))
    }, 20)
  }
}

window.chrome = {
  runtime: { lastError: undefined, connectNative: () => port },
  tabs: { query: async () => [{ id: 1, url: 'https://mail.google.com/mail/u/0/' }] },
  scripting: { executeScript: async () => [{ result: { usuario: true, contrasena: true, codigo: false } }] }
}

ipcRenderer.on('pulsar', (_e, selector, texto) => {
  const nodos = [...document.querySelectorAll(selector)]
  const nodo = texto ? nodos.find((x) => x.textContent.includes(texto)) : nodos[0]
  if (nodo) nodo.click()
  ipcRenderer.send('pulsado', !!nodo)
})

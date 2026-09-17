/*
 * La precarga de la prueba: hace de navegador con la extensión puesta.
 *
 * Monta las tres piezas que en Opera pone Chromium:
 *
 * 1. Un `navigator.credentials` «del navegador» de mentira, que solo apunta que
 *    lo han llamado: en Electron no hay ventana de Windows Hello, y lo que hay
 *    que comprobar es justo eso, que cuando CLAC no se mete se llama al de fuera.
 * 2. El guion de la extensión que va en el mundo de la página (`llave-pagina.js`).
 * 3. El guion del aviso (`llave-aviso.js`), aquí, en el mundo aparte, con un
 *    `chrome.runtime` que lleva los mensajes al proceso principal, que hace de
 *    service worker y de CLAC.
 *
 * Y deja dos cables para la prueba: buscar un botón del aviso —que vive en un
 * «shadow root» cerrado— y leer lo que pone.
 */
const { contextBridge, ipcRenderer } = require('electron')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const compilado = (archivo) => join(__dirname, '..', '..', 'extension', 'dist', archivo)

contextBridge.executeInMainWorld({
  func: () => {
    window.nativasLlamadas = { crear: 0, entrar: 0 }
    const rechazar = () => Promise.reject(new DOMException('aquí seguiría el navegador por su cuenta', 'NotAllowedError'))
    const crear = function () {
      window.nativasLlamadas.crear++
      return rechazar()
    }
    const entrar = function () {
      window.nativasLlamadas.entrar++
      return rechazar()
    }
    Object.defineProperty(CredentialsContainer.prototype, 'create', { value: crear, writable: true, configurable: true })
    Object.defineProperty(CredentialsContainer.prototype, 'get', { value: entrar, writable: true, configurable: true })
  }
})

contextBridge.executeInMainWorld({
  func: (fuente) => (0, eval)(fuente),
  args: [readFileSync(compilado('llave-pagina.js'), 'utf8')]
})

// El aviso se dibuja en un «shadow root» cerrado: se guarda la referencia al
// crearlo, que es la única manera de mirarlo desde la prueba.
let sombra = null
const attachShadowOriginal = Element.prototype.attachShadow
Element.prototype.attachShadow = function (opciones) {
  sombra = attachShadowOriginal.call(this, opciones)
  return sombra
}

globalThis.chrome = {
  runtime: {
    id: 'clac-prueba',
    lastError: undefined,
    getURL: (archivo) => archivo,
    sendMessage: (mensaje, responder) => {
      ipcRenderer.invoke('clac', mensaje).then(responder)
    }
  }
}
;(0, eval)(readFileSync(compilado('llave-aviso.js'), 'utf8'))

ipcRenderer.on('buscar', (_ev, texto) => {
  const botones = sombra && sombra.host.isConnected ? [...sombra.querySelectorAll('button')] : []
  const boton = botones.find((b) => (b.textContent || '').includes(texto))
  const caja = boton ? boton.getBoundingClientRect() : null
  ipcRenderer.send('encontrado', caja ? { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 } : null)
})

ipcRenderer.on('leer', () => {
  const texto = sombra && sombra.host.isConnected ? (sombra.textContent || '').replace(/\s+/g, ' ').trim() : null
  ipcRenderer.send('leido', texto)
})

// Preload de mentira: finge `window.clac` con datos de ejemplo para retratar la
// interfaz sin caja fuerte de verdad. Recibe por argumentos qué estado fingir.
const { contextBridge, ipcRenderer } = require('electron')

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1]
const SESION = arg('sesion', 'abierta')
const TEMA = arg('tema', 'dark')
const PALETA = arg('paleta', 'grafito')

let n = 0
const id = () => `id${++n}`
const campo = (clave, etiqueta, tipo, valor) => ({ id: id(), clave, etiqueta, tipo, valor })
const ahora = new Date('2026-09-13T11:40:00')
const hace = (dias) => new Date(ahora.getTime() - dias * 86400000).toISOString()

const bovedas = [
  { id: 'b1', nombre: 'Personal', descripcion: '', icono: 'vault', color: '#2f7de1', orden: 0, creada: hace(40) },
  { id: 'b2', nombre: 'Trabajo', descripcion: '', icono: 'briefcase', color: '#1f8a5b', orden: 1, creada: hace(30) }
]

function el(titulo, categoria, bovedaId, secciones, extra = {}) {
  const principal = secciones
  const usuario = principal.find((c) => c.clave === 'usuario')?.valor ?? ''
  return {
    id: id(), bovedaId, estado: 'activo', creado: hace(20), modificado: hace(extra.dias ?? 3), usado: hace(1), usos: extra.usos ?? 2,
    adjuntos: 0, eliminadoEn: null, titulo, categoria, subtitulo: extra.subtitulo ?? usuario, webs: extra.webs ?? [],
    etiquetas: extra.etiquetas ?? [], favorito: !!extra.favorito, tieneTotp: principal.some((c) => c.tipo === 'totp'),
    secciones: [{ id: id(), titulo: '', campos: principal }], notas: extra.notas ?? '', adjuntosInfo: []
  }
}

const elementos = [
  el('Google', 'login', 'b1', [campo('usuario', 'Usuario', 'texto', 'ana.garcia.ejemplo@gmail.com'), campo('contrasena', 'Contraseña', 'oculto', 'x7#Qm2vL!pR9&tZ4wKb8'), campo(undefined, 'Código de un solo uso', 'totp', 'JBSWY3DPEHPK3PXP')], { webs: ['https://accounts.google.com'], usos: 40 }),
  el('Banco Ejemplo', 'login', 'b1', [campo('usuario', 'Usuario', 'texto', '12345678Z'), campo('contrasena', 'Contraseña', 'oculto', 'Sol-Tiza-Barco-Lento-Pino')], { webs: ['https://www.bancoejemplo.es'], usos: 12 }),
  el('Netflix', 'login', 'b1', [campo('usuario', 'Usuario', 'texto', 'ana.garcia.ejemplo@gmail.com'), campo('contrasena', 'Contraseña', 'oculto', 'hola1234')], { webs: ['https://www.netflix.com'] }),
  el('Amazon', 'login', 'b1', [campo('usuario', 'Usuario', 'texto', 'ana.garcia.ejemplo@gmail.com'), campo('contrasena', 'Contraseña', 'oculto', 'hola1234')], { webs: ['https://www.amazon.es'] }),
  el('GitHub', 'login', 'b2', [campo('usuario', 'Usuario', 'texto', 'anagarcia-dev'), campo('contrasena', 'Contraseña', 'oculto', 'Gh!8vN2#kd7Q')], { webs: ['https://github.com'] }),
  el('Visa Oro', 'tarjeta', 'b1', [campo('titular', 'Titular', 'texto', 'ANA GARCIA PEREZ'), campo('numero', 'Número', 'oculto', '4000 1234 5678 9010'), campo('caducidad', 'Caducidad', 'mesAnio', '2026-10'), campo('cvv', 'Código de seguridad', 'oculto', '123')], { subtitulo: '•••• 9010' }),
  el('DNI', 'dni', 'b1', [campo('numero', 'Número', 'texto', '12345678Z'), campo('nombre', 'Nombre completo', 'texto', 'Ana García Pérez'), campo('caducidad', 'Caducidad', 'fecha', '2031-03-05')], { subtitulo: 'Ana García Pérez' }),
  el('Wifi de casa', 'wifi', 'b1', [campo('red', 'Nombre de la red', 'texto', 'MiFibra-7A2C'), campo('contrasena', 'Contraseña de la red', 'oculto', 'Tortuga-Farola-Queso')], { subtitulo: 'MiFibra-7A2C' }),
  el('Seguro del coche', 'nota', 'b1', [], { subtitulo: 'Póliza 00-123456, renovación en marzo', notas: 'Póliza 00-123456, renovación en marzo' }),
  el('Tienda antigua', 'login', 'b1', [campo('usuario', 'Usuario', 'texto', 'ana'), campo('contrasena', 'Contraseña', 'oculto', 'P9$mR2!vK7@q')], { webs: ['http://tienda-antigua.es'] })
]
const lista = elementos.map(({ secciones, notas, adjuntosInfo, ...resto }) => resto)

const informe = {
  puntuacion: 60, revisados: 10, conProblemas: 4, filtradasRevisadasEn: hace(2),
  grupos: [
    { tipo: 'debil', elementos: [2, 3].map((i) => ({ id: lista[i].id, titulo: lista[i].titulo, subtitulo: lista[i].subtitulo, categoria: 'login', webs: lista[i].webs, nota: 'Muy débil' })) },
    { tipo: 'repetida', elementos: [2, 3].map((i) => ({ id: lista[i].id, titulo: lista[i].titulo, subtitulo: lista[i].subtitulo, categoria: 'login', webs: lista[i].webs, nota: 'La comparten 2 elementos', grupo: 1 })) },
    { tipo: 'sinCifrar', elementos: [{ id: lista[9].id, titulo: lista[9].titulo, subtitulo: 'ana', categoria: 'login', webs: lista[9].webs, nota: 'tienda-antigua.es' }] },
    { tipo: 'caduca', elementos: [{ id: lista[5].id, titulo: 'Visa Oro', subtitulo: '•••• 9010', categoria: 'tarjeta', webs: [], nota: 'Caduca en octubre de 2026' }] }
  ]
}

const ajustes = { navegador: true, theme: TEMA, palette: PALETA, bloqueoMinutos: 10, bloquearAlSuspender: true, bloquearAlBloquearWindows: true, portapapelesSegundos: 90, accesoRapido: true, arrancarConWindows: false, cerrarABandeja: true, ordenLista: 'titulo', ultimaCopia: hace(0), windowsHello: true, buscarVersiones: true }
const ok = (v) => Promise.resolve(v)
const nada = () => () => {}

contextBridge.exposeInMainWorld('clac', {
  sesion: { estado: () => ok(SESION), crear: () => ok('C1-7KQ2MX-4TP9A-HX3VE-Z8R2K-N6YWD-QF5LBW'), desbloquear: () => ok(), bloquear: () => ok(), hello: () => ok({ activo: true, listo: true }), desbloquearHello: () => new Promise(() => {}), cambiarContrasena: () => ok(), claveSecreta: () => ok(''), kit: () => ok(null), restaurarElegir: () => ok(null), restaurar: () => ok() },
  hello: { disponible: () => ok('Available'), activar: () => ok(ajustes) },
  ajustes: { leer: () => ok(ajustes), guardar: (c) => ok({ ...ajustes, ...c }) },
  bovedas: { listar: () => ok(bovedas), guardar: () => ok(bovedas[0]), eliminar: () => ok() },
  elementos: { listar: () => ok(lista), obtener: (i) => ok(elementos.find((e) => e.id === i)), guardar: (e) => ok(e), estado: () => ok(), eliminarDefinitivamente: () => ok(0), vaciarPapelera: () => ok(0), mover: () => ok(), duplicar: () => ok(elementos[0]), historial: () => ok([]), restaurarVersion: () => ok(elementos[0]) },
  adjuntos: { anadir: () => ok([]), guardar: () => ok(null), vistaPrevia: () => ok(null), eliminar: () => ok() },
  copiar: { campo: () => ok({ segundos: 90 }), texto: () => ok({ segundos: 90 }), rapido: () => ok({ segundos: 90 }) },
  acceso: { buscar: () => ok(lista.filter((e) => e.usos > 5).concat(lista.slice(2, 6))), ocultar: () => ok(), abrirEnApp: () => ok(), abrirPrincipal: () => ok() },
  watchtower: { informe: () => ok(informe), filtradas: () => ok(informe) },
  ssh: { generar: () => ok({}) },
  web: { abrir: () => ok() },
  app: { version: () => ok(require('../../package.json').version) },
  actualizacion: { estado: () => ok({ fase: 'ociosa', version: null, porcentaje: 0, comprobadaEn: hace(0), mensaje: null }), buscar: () => ok(null), descargar: () => ok(true), instalar: () => ok(false) },
  datos: { info: () => ok({ carpeta: 'C:\\Users\\ana\\AppData\\Roaming\\CLAC', archivo: '', copias: 4, ultimaCopia: hace(0), elementos: 10, bovedas: 2 }), copiaAhora: () => ok(''), abrirCarpeta: () => ok(''), guardarCopiaCifrada: () => ok(null), exportar: () => ok(null) },
  navegador: { info: () => ok({ activo: true, carpetaExtension: 'C:\\Users\\ana\\AppData\\Local\\Programs\\CLAC\\resources\\extension', idExtension: 'enbgijpmdefhfcgfnbmplchdccgcmccd', registrado: true, ultimaConexion: hace(0) }), abrirCarpeta: () => ok('') },
  importar: { elegir: () => ok({ formato: 'chromium', nombreFormato: 'Opera, Chrome, Edge o Brave', archivo: 'Opera Passwords.csv', total: 48, porCategoria: { login: 48 }, repetidos: 3, muestra: [{ titulo: 'amazon.es', subtitulo: 'ana.garcia.ejemplo@gmail.com', categoria: 'login' }, { titulo: 'renfe.com', subtitulo: 'ana.garcia.ejemplo@gmail.com', categoria: 'login' }, { titulo: 'sede.agenciatributaria.gob.es', subtitulo: '12345678Z', categoria: 'login' }, { titulo: 'spotify.com', subtitulo: 'anagarcia', categoria: 'login' }], avisos: [] }), confirmar: () => ok({ nuevos: 0, repetidos: 0 }), cancelar: () => ok() },
  en: { sesion: nada, datos: nada, ajustes: nada, menu: nada, abrirElemento: nada, accesoMostrado: nada, progresoFiltradas: nada, actualizacion: nada }
})

// El arnés pide clics por aquí: el preload ve el DOM y `executeJavaScript` no puede (CSP).
ipcRenderer.on('pulsar', (_e, selector, texto) => {
  const nodos = [...document.querySelectorAll(selector)]
  const nodo = texto ? nodos.find((x) => x.textContent.includes(texto)) : nodos[0]
  if (nodo) nodo.click()
  ipcRenderer.send('pulsado', !!nodo)
})

// El clic derecho, en el centro del elemento.
ipcRenderer.on('contextual', (_e, selector, texto) => {
  const nodos = [...document.querySelectorAll(selector)]
  const nodo = texto ? nodos.find((x) => x.textContent.includes(texto)) : nodos[0]
  if (nodo) {
    const r = nodo.getBoundingClientRect()
    nodo.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width * 0.45, clientY: r.top + r.height / 2 }))
  }
  ipcRenderer.send('pulsado', !!nodo)
})

// Escribir en un campo como si se tecleara, para los formularios de React.
ipcRenderer.on('escribir', (_e, selector, valor) => {
  const campo = document.querySelector(selector)
  if (campo) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, valor)
    campo.dispatchEvent(new Event('input', { bubbles: true }))
  }
  ipcRenderer.send('pulsado', !!campo)
})

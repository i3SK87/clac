/*
 * La prueba de las llaves de acceso, de punta a punta y en Chromium.
 *
 *   npm run prueba:llaves
 *
 * Levanta una web local que pide una llave de verdad con `navigator.credentials`
 * y que comprueba por su cuenta lo que le devuelven —el CBOR de la atestación,
 * las banderas, el reto, el origen y la firma—, con un verificador escrito aquí
 * aparte del que firma. En medio está la extensión tal cual se compila, dentro
 * de una ventana fuera de pantalla, y detrás una caja fuerte de CLAC de verdad
 * en una carpeta temporal. No toca nada del CLAC instalado.
 *
 * Se pulsa en el aviso con pulsaciones de ratón de las de verdad, que es lo
 * único que el aviso acepta.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { createHash, createPublicKey, randomBytes, verify } = require('node:crypto')
const { createServer } = require('node:http')
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { arrancarClac } = require(join(__dirname, '..', '..', 'out', 'test', 'llaves-clac.cjs'))

const COMPILADO = join(__dirname, '..', '..', 'extension', 'dist')
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

let bien = 0
let mal = 0

function check(nombre, condicion, detalle = '') {
  if (condicion) {
    bien++
    console.log(`  ok   ${nombre}`)
  } else {
    mal++
    console.log(`  FALLO ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  }
}

function equal(nombre, obtenido, esperado) {
  check(nombre, Object.is(obtenido, esperado), `esperado ${String(esperado)}, obtenido ${String(obtenido)}`)
}

const sha256 = (dato) => createHash('sha256').update(dato).digest()

/* ---------- Un lector de CBOR, escrito aquí: lo que haría el servidor de la web ---------- */

function leerCbor(b, pos = { i: 0 }) {
  const inicial = b[pos.i++]
  const mayor = inicial >> 5
  const corto = inicial & 0x1f
  let largo = corto
  if (corto === 24) largo = b[pos.i++]
  else if (corto === 25) {
    largo = b.readUInt16BE(pos.i)
    pos.i += 2
  } else if (corto === 26) {
    largo = b.readUInt32BE(pos.i)
    pos.i += 4
  }
  if (mayor === 0) return largo
  if (mayor === 1) return -largo - 1
  if (mayor === 2 || mayor === 3) {
    const trozo = b.subarray(pos.i, pos.i + largo)
    pos.i += largo
    return mayor === 2 ? trozo : trozo.toString('utf8')
  }
  if (mayor === 5) {
    const mapa = {}
    for (let i = 0; i < largo; i++) {
      const llave = leerCbor(b, pos)
      mapa[String(llave)] = leerCbor(b, pos)
    }
    return mapa
  }
  throw new Error('CBOR que no se entiende')
}

/* ---------- El servidor de la web de prueba ---------- */

const credenciales = new Map()
let retoActual = null
let origenEsperado = ''
const RP = 'localhost'

function revisarCliente(b64, tipo) {
  const cliente = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'))
  if (cliente.type !== tipo) return `el tipo es ${cliente.type}`
  if (cliente.challenge !== retoActual) return 'el reto no es el que mandé'
  if (cliente.origin !== origenEsperado) return `el origen es ${cliente.origin}`
  return null
}

function registrar(cuerpo) {
  const falloCliente = revisarCliente(cuerpo.clientDataJSON, 'webauthn.create')
  if (falloCliente) return { ok: false, motivo: falloCliente }
  const atestacion = leerCbor(Buffer.from(cuerpo.attestationObject, 'base64url'))
  if (atestacion.fmt !== 'none') return { ok: false, motivo: `la atestación es ${atestacion.fmt}` }
  const datos = atestacion.authData
  if (!datos.subarray(0, 32).equals(sha256(RP))) return { ok: false, motivo: 'el dominio firmado no es el mío' }
  const banderas = datos[32]
  if (!(banderas & 0x01)) return { ok: false, motivo: 'no dice que haya nadie delante' }
  if (!(banderas & 0x40)) return { ok: false, motivo: 'no trae credencial' }
  const largoId = datos.readUInt16BE(53)
  const credencialId = datos.subarray(55, 55 + largoId).toString('base64url')
  if (credencialId !== cuerpo.id || credencialId !== cuerpo.rawId) return { ok: false, motivo: 'el identificador no cuadra' }
  const cose = leerCbor(datos.subarray(55 + largoId))
  if (cose['3'] !== -7) return { ok: false, motivo: 'la clave no es ES256' }
  const publica = createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: cose['-2'].toString('base64url'), y: cose['-3'].toString('base64url') },
    format: 'jwk'
  })
  credenciales.set(credencialId, publica)
  return {
    ok: true,
    id: credencialId,
    verificado: !!(banderas & 0x04),
    respaldada: !!(banderas & 0x10),
    contador: datos.readUInt32BE(33),
    aaguidACeros: datos.subarray(37, 53).every((x) => x === 0)
  }
}

function entrar(cuerpo) {
  const publica = credenciales.get(cuerpo.id)
  if (!publica) return { ok: false, motivo: 'esa credencial no la tengo' }
  const falloCliente = revisarCliente(cuerpo.clientDataJSON, 'webauthn.get')
  if (falloCliente) return { ok: false, motivo: falloCliente }
  const datos = Buffer.from(cuerpo.authenticatorData, 'base64url')
  if (!datos.subarray(0, 32).equals(sha256(RP))) return { ok: false, motivo: 'el dominio firmado no es el mío' }
  if (!(datos[32] & 0x01)) return { ok: false, motivo: 'no dice que haya nadie delante' }
  const firmado = Buffer.concat([datos, sha256(Buffer.from(cuerpo.clientDataJSON, 'base64url'))])
  const vale = verify('sha256', firmado, publica, Buffer.from(cuerpo.firma, 'base64url'))
  return { ok: vale, motivo: vale ? '' : 'la firma no cuadra', usuario: cuerpo.usuario, verificado: !!(datos[32] & 0x04) }
}

function arrancarServidor() {
  const servidor = createServer((peticion, respuesta) => {
    const responder = (datos) => {
      respuesta.writeHead(200, { 'content-type': 'application/json' })
      respuesta.end(JSON.stringify(datos))
    }
    if (peticion.url === '/') {
      respuesta.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return respuesta.end(readFileSync(join(__dirname, 'pagina.html')))
    }
    if (peticion.url === '/reto') {
      retoActual = randomBytes(32).toString('base64url')
      return responder({ reto: retoActual })
    }
    let cuerpo = ''
    peticion.on('data', (t) => (cuerpo += t))
    peticion.on('end', () => {
      let datos = {}
      try {
        datos = JSON.parse(cuerpo || '{}')
      } catch {
        return responder({ ok: false, motivo: 'no se entiende lo que manda la página' })
      }
      if (peticion.url === '/registrar') return responder(registrar(datos))
      if (peticion.url === '/entrar') return responder(entrar(datos))
      responder({ ok: false, motivo: 'esa ruta no existe' })
    })
  })
  return new Promise((resolver) => servidor.listen(0, '127.0.0.1', () => resolver(servidor)))
}

/* ---------- La ventana, el aviso y las pulsaciones ---------- */

let ventana = null
let ultimaImagen = null
const capturas = mkdtempSync(join(tmpdir(), 'clac-llaves-capturas-'))

const ejecutar = (codigo) => ventana.webContents.executeJavaScript(codigo, true)

function buscarBoton(texto) {
  return new Promise((resolver) => {
    ipcMain.once('encontrado', (_ev, caja) => resolver(caja))
    ventana.webContents.send('buscar', texto)
  })
}

async function esperarBoton(texto, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    const caja = await buscarBoton(texto)
    if (caja) return caja
    await espera(100)
  }
  return null
}

function leerAviso() {
  return new Promise((resolver) => {
    ipcMain.once('leido', (_ev, texto) => resolver(texto))
    ventana.webContents.send('leer')
  })
}

async function pulsar(texto) {
  const caja = await esperarBoton(texto)
  if (!caja) return false
  const punto = { x: Math.round(caja.x), y: Math.round(caja.y) }
  ventana.webContents.sendInputEvent({ type: 'mouseMove', ...punto })
  await espera(60)
  ventana.webContents.sendInputEvent({ type: 'mouseDown', ...punto, button: 'left', clickCount: 1 })
  ventana.webContents.sendInputEvent({ type: 'mouseUp', ...punto, button: 'left', clickCount: 1 })
  return true
}

async function capturar(nombre) {
  ventana.webContents.invalidate()
  await espera(500)
  if (!ultimaImagen) return
  writeFileSync(join(capturas, `${nombre}.png`), ultimaImagen.toPNG())
}

const nativas = () => ejecutar('window.nativas()')

/* ---------- La prueba ---------- */

app.whenReady().then(async () => {
  const servidor = await arrancarServidor()
  const base = `http://localhost:${servidor.address().port}`
  origenEsperado = base
  const clac = arrancarClac(mkdtempSync(join(tmpdir(), 'clac-llaves-caja-')))

  ipcMain.handle('clac', async (ev, mensaje) => {
    if (mensaje && mensaje.tipo === 'estilos') return { ok: true, datos: readFileSync(join(COMPILADO, 'llave.css'), 'utf8') }
    // Lo que hace el service worker: el origen lo pone el navegador.
    const origen = new URL(ev.senderFrame ? ev.senderFrame.url : base).origin
    const r = await clac.pedir(mensaje, origen)
    return { ok: r.ok, datos: r.datos, error: r.error, nombreError: r.nombreError }
  })

  ventana = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    frame: false,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      sandbox: false,
      preload: join(__dirname, 'precarga.cjs')
    }
  })
  ventana.webContents.setFrameRate(10)
  ventana.webContents.on('paint', (_ev, _sucio, imagen) => {
    if (!imagen.isEmpty()) ultimaImagen = imagen
  })
  await ventana.loadURL(base + '/')
  await espera(600)

  console.log('\nRegistrar una llave')
  const registro = ejecutar('window.probar("registrar")')
  check('sale el aviso de CLAC', (await esperarBoton('Guardar en CLAC')) !== null)
  const texto = await leerAviso()
  check('dice de qué web y para quién', /localhost/.test(texto || '') && /ana-dev/.test(texto || ''), String(texto))
  await capturar('01-crear')
  await pulsar('Guardar en CLAC')
  const r1 = await registro
  check('la web da el registro por bueno', r1.ok && r1.valor.ok, JSON.stringify(r1))
  const credencial = r1.ok && r1.valor.id
  if (r1.ok && r1.valor.ok) {
    check('verificada, con contador a cero y sin decir qué aparato es', r1.valor.verificado && r1.valor.contador === 0 && r1.valor.aaguidACeros)
    check('y marcada como respaldada, que la caja fuerte se copia', r1.valor.respaldada)
    const c = r1.valor.comprobaciones
    check('para la web es una PublicKeyCredential de las suyas', c.esCredencial && c.esAtestacion && c.rawIdEsBuffer)
    check('con el tipo y el enganche que toca', c.tipo === 'public-key' && c.enganche === 'platform', JSON.stringify(c))
    check('con la clave pública y los datos sueltos', c.publicaSuelta && c.datosSueltos && c.algoritmo === -7)
    check('y con toJSON, que es lo que usan las webs modernas', c.conToJSON)
    check('dice que la llave se queda guardada (credProps)', c.extensiones && c.extensiones.credProps && c.extensiones.credProps.rk === true, JSON.stringify(c.extensiones))
  }
  const guardados = clac.elementos()
  check('en CLAC hay un inicio de sesión con su llave', guardados.length === 1 && guardados[0].llaves === 1 && guardados[0].usuario === 'ana-dev', JSON.stringify(guardados))

  console.log('\nEntrar con la llave')
  const entrada = ejecutar(`window.probar("entrar", ["${credencial}"])`)
  check('sale el aviso con la cuenta', (await esperarBoton('ana-dev')) !== null)
  await capturar('02-entrar')
  await pulsar('ana-dev')
  const r2 = await entrada
  check('la web da la firma por buena', r2.ok && r2.valor.ok, JSON.stringify(r2))
  if (r2.ok && r2.valor.ok) {
    check('y viene con la cuenta y con la verificación', r2.valor.usuario === 'AQIDBA' && r2.valor.verificado, JSON.stringify(r2.valor))
    check('la respuesta es una aserción de las de la web', r2.valor.esAsercion)
  }

  console.log('\nEntrar sin decir qué credencial (llave descubrible)')
  const entrada2 = ejecutar('window.probar("entrar", [])')
  await pulsar('ana-dev')
  const r3 = await entrada2
  check('también vale', r3.ok && r3.valor.ok, JSON.stringify(r3))

  console.log('\nCuando no la lleva CLAC')
  const antes = await nativas()
  const otra = ejecutar('window.probar("registrar")')
  await pulsar('Usar otra llave')
  const r4 = await otra
  const despues = await nativas()
  check('con «usar otra llave» sigue el navegador', despues.crear === antes.crear + 1, JSON.stringify(despues))
  check('y la web se entera por el navegador, no por CLAC', !r4.ok && r4.error === 'NotAllowedError', JSON.stringify(r4))
  equal('sin guardar nada nuevo en la caja', clac.elementos().length, 1)

  const inventada = Buffer.from('no existe esta cred').toString('base64url')
  const r5 = await ejecutar(`window.probar("entrar", ["${inventada}"])`)
  const tras5 = await nativas()
  check('una web de la que no tienes llave no saca ningún aviso', tras5.entrar === despues.entrar + 1, JSON.stringify(tras5))
  check('y la lleva el navegador', !r5.ok && r5.error === 'NotAllowedError')

  const r6 = await ejecutar('window.probar("entrarConAutorrelleno")')
  const tras6 = await nativas()
  check('el autorrelleno del formulario también es del navegador', tras6.entrar === tras5.entrar + 1 && !r6.ok, JSON.stringify(tras6))

  console.log('\nLa llave que ya tienes')
  const repetida = ejecutar(`window.probar("registrar", "ana-dev", ["${credencial}"])`)
  check('avisa de que ya la tienes', (await esperarBoton('Entendido')) !== null)
  const textoRepetida = await leerAviso()
  check('y lo dice con el nombre del elemento', /Ya tienes una llave/.test(textoRepetida || ''), String(textoRepetida))
  await capturar('03-repetida')
  await pulsar('Entendido')
  const r7 = await repetida
  check('a la web se le dice lo que dice el estándar', !r7.ok && r7.error === 'InvalidStateError', JSON.stringify(r7))

  console.log('\nSi la web se cansa de esperar')
  const abortada = ejecutar('window.probar("registrarAbortando")')
  check('el aviso está puesto', (await esperarBoton('Guardar en CLAC')) !== null)
  await ejecutar('window.abortar()')
  const r8 = await abortada
  check('la web recibe su AbortError', !r8.ok && r8.error === 'AbortError', JSON.stringify(r8))
  await espera(200)
  equal('y el aviso se quita solo', await leerAviso(), null)

  console.log('\nCon CLAC bloqueada')
  clac.bloquear()
  const conBloqueo = ejecutar(`window.probar("entrar", ["${credencial}"])`)
  check('el aviso dice que está bloqueada', (await esperarBoton('Usar Windows Hello')) !== null)
  const textoBloqueo = await leerAviso()
  check('y no pide la contraseña maestra dentro de la web', !/maestra/i.test(textoBloqueo || ''), String(textoBloqueo))
  await capturar('04-bloqueada')
  await pulsar('Usar Windows Hello')
  check('al desbloquear sale la cuenta para entrar', (await esperarBoton('ana-dev')) !== null)
  await pulsar('ana-dev')
  const r9 = await conBloqueo
  check('y entra', r9.ok && r9.valor.ok, JSON.stringify(r9))

  console.log('\nOtra cuenta de la misma web')
  const segunda = ejecutar('window.probar("registrar", "ana-trabajo")')
  await pulsar('Guardar en CLAC')
  const r10 = await segunda
  check('se guarda como otro elemento', r10.ok && r10.valor.ok && clac.elementos().length === 2, JSON.stringify(clac.elementos()))
  const conDos = ejecutar('window.probar("entrar", [])')
  check('y al entrar salen las dos para elegir', (await esperarBoton('ana-trabajo')) !== null)
  await capturar('05-dos-cuentas')
  await pulsar('ana-trabajo')
  const r11 = await conDos
  check('entra con la que elijas', r11.ok && r11.valor.ok && r11.valor.usuario === 'CQkJCQ', JSON.stringify(r11))

  console.log(`\nCapturas del aviso en ${capturas}`)
  console.log(`\n${bien} bien, ${mal} mal`)
  clac.cerrar()
  servidor.close()
  app.exit(mal ? 1 : 0)
})

process.on('unhandledRejection', (e) => {
  console.error('fallo suelto:', e)
  app.exit(1)
})

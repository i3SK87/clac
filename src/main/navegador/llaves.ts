/**
 * Las llaves de acceso, por dentro: generar, guardar y firmar.
 *
 * Esto es lo que en WebAuthn hace el «autenticador» —el chip del ordenador, la
 * llave USB o el móvil—; aquí lo hace CLAC con la caja fuerte. Cada llave es
 * una pareja de claves de curva elíptica P-256 (ES256, que es lo que aceptan
 * todas las webs): la pública se la lleva la web y la privada se guarda cifrada
 * en la caja, dentro del inicio de sesión de esa web, y no sale nunca de este
 * proceso. La extensión solo ve lo ya firmado.
 *
 * Al crear se devuelve una atestación «none»: no se le cuenta a la web qué
 * aparato ha hecho la llave, igual que hacen 1Password o el iPhone.
 *
 * El contador de firmas va siempre a cero, que es lo que dice el estándar para
 * los autenticadores que no lo llevan. Si subiera, una caja fuerte restaurada
 * de una copia volvería atrás y la web podría pensar que le han clonado la
 * llave y cerrar la cuenta.
 */
import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { nuevoId, seccionesDePlantilla, usuarioDe } from '@shared/categorias'
import { CLAVE_LLAVE, ETIQUETA_LLAVE, ErrorLlave, escribirLlave, llavesDe, rpIdDe, type Llave } from '@shared/llaves'
import { dominioDe } from '@shared/webs'
import type { LlaveNavegador, PeticionCrearLlave, PeticionFirmarLlave, RespuestaCrearLlave, RespuestaFirmarLlave } from '@shared/navegador'
import type { Elemento, Seccion } from '@shared/tipos'
import type { CajaFuerte } from '../boveda/boveda'

/** ES256: firma ECDSA con P-256 y SHA-256. Es la que entienden todas las webs. */
const ES256 = -7

/* ---------- Las banderas de `authenticatorData` ---------- */

/** Hay alguien delante: ha pulsado en el aviso de CLAC. */
const PRESENTE = 0x01
/**
 * Se ha comprobado quién eres. CLAC la pone con la caja fuerte abierta: para
 * abrirla hicieron falta la contraseña maestra o Windows Hello, como en 1Password.
 */
const VERIFICADO = 0x04
/** La llave se puede respaldar, y lo está: la caja fuerte se copia entera. */
const RESPALDABLE = 0x08
const RESPALDADA = 0x10
/** Esta respuesta lleva dentro la clave pública recién hecha. */
const CON_CREDENCIAL = 0x40

function sha256(dato: Buffer | string): Buffer {
  return createHash('sha256').update(dato).digest()
}

/* ---------- CBOR, lo justo ---------- */

/*
 * La atestación y la clave pública viajan en CBOR, que es como JSON pero en
 * binario. Solo hacen falta enteros, textos, bytes y mapas, siempre en el orden
 * canónico de CTAP2: cuarenta líneas en vez de una dependencia más.
 */

function cabeza(mayor: number, valor: number): Buffer {
  if (valor < 24) return Buffer.from([(mayor << 5) | valor])
  if (valor < 0x100) return Buffer.from([(mayor << 5) | 24, valor])
  if (valor < 0x10000) {
    const b = Buffer.alloc(3)
    b[0] = (mayor << 5) | 25
    b.writeUInt16BE(valor, 1)
    return b
  }
  const b = Buffer.alloc(5)
  b[0] = (mayor << 5) | 26
  b.writeUInt32BE(valor, 1)
  return b
}

function cborEntero(n: number): Buffer {
  return n >= 0 ? cabeza(0, n) : cabeza(1, -n - 1)
}

function cborTexto(texto: string): Buffer {
  const bytes = Buffer.from(texto, 'utf8')
  return Buffer.concat([cabeza(3, bytes.length), bytes])
}

function cborBytes(bytes: Buffer): Buffer {
  return Buffer.concat([cabeza(2, bytes.length), bytes])
}

function cborMapa(pares: Array<[Buffer, Buffer]>): Buffer {
  return Buffer.concat([cabeza(5, pares.length), ...pares.map(([k, v]) => Buffer.concat([k, v]))])
}

/** La clave pública en formato COSE, que es como la espera la web. */
function claveCose(x: Buffer, y: Buffer): Buffer {
  return cborMapa([
    [cborEntero(1), cborEntero(2)],
    [cborEntero(3), cborEntero(ES256)],
    [cborEntero(-1), cborEntero(1)],
    [cborEntero(-2), cborBytes(x)],
    [cborEntero(-3), cborBytes(y)]
  ])
}

/* ---------- Lo que se firma ---------- */

/**
 * `authenticatorData`: el resumen del dominio, las banderas, el contador y, al
 * crear, la credencial nueva. Es la mitad de lo que se firma; la otra mitad es
 * el resumen de `clientDataJSON`.
 */
function datosAutenticador(rpId: string, banderas: number, credencial?: { id: Buffer; cose: Buffer }): Buffer {
  const partes = [sha256(rpId), Buffer.from([banderas]), Buffer.alloc(4)]
  if (credencial) {
    const largo = Buffer.alloc(2)
    largo.writeUInt16BE(credencial.id.length, 0)
    // El AAGUID a ceros: no se dice qué aparato ha hecho la llave.
    partes.push(Buffer.alloc(16), largo, credencial.id, credencial.cose)
  }
  return Buffer.concat(partes)
}

/**
 * `clientDataJSON`: lo que en un navegador normal cuenta el propio navegador de
 * esta ceremonia. Lo escribe CLAC con el origen que ha dicho el navegador —no
 * el que diga la página— y va dentro de la firma: si la web está en otro sitio,
 * la firma no cuadra y no la aceptan.
 */
function datosCliente(tipo: 'webauthn.create' | 'webauthn.get', reto: string, origen: string): Buffer {
  return Buffer.from(JSON.stringify({ type: tipo, challenge: reto, origin: origen, crossOrigin: false }), 'utf8')
}

/** El reto llega en base64url; se vuelve a escribir igual, para que no cuele nada raro. */
function retoDe(texto: string): string {
  const bytes = Buffer.from(texto, 'base64url')
  if (!bytes.length) throw new ErrorLlave('NotAllowedError', 'La web no ha mandado ningún reto.')
  return bytes.toString('base64url')
}

/* ---------- Buscar en la caja fuerte ---------- */

interface LlaveGuardada {
  elemento: Elemento
  llave: Llave
  campoId: string
}

/** Todas las llaves activas de un dominio, sin repetir credenciales duplicadas. */
function buscarLlaves(caja: CajaFuerte, rpId: string): LlaveGuardada[] {
  const salida: LlaveGuardada[] = []
  const vistas = new Set<string>()
  for (const e of caja.listar()) {
    if (e.estado !== 'activo') continue
    const elemento = caja.obtener(e.id)
    for (const { campo, llave } of llavesDe(elemento)) {
      if (llave.rpId !== rpId || vistas.has(llave.id)) continue
      vistas.add(llave.id)
      salida.push({ elemento, llave, campoId: campo.id })
    }
  }
  return salida
}

export function llavesParaWeb(caja: CajaFuerte, origen: string, rpId?: string): LlaveNavegador[] {
  return buscarLlaves(caja, rpIdDe(origen, rpId)).map(({ elemento, llave }) => ({
    id: llave.id,
    elementoId: elemento.id,
    titulo: elemento.titulo,
    usuario: llave.usuario || llave.nombre,
    creada: llave.creada
  }))
}

function mismoDominio(web: string, rpId: string): boolean {
  const host = dominioDe(web)
  return host === rpId || host.endsWith(`.${rpId}`)
}

function origenLimpio(origen: string): string {
  try {
    return new URL(origen).origin
  } catch {
    return origen
  }
}

/**
 * Guarda la llave donde luego se va a buscar: en el inicio de sesión que ya
 * tengas de esa web con ese usuario y, si no hay ninguno, en uno nuevo. Si la
 * web vuelve a crear una llave para la misma cuenta se cambia la de antes —que
 * es lo que manda el estándar— y la vieja se queda en el historial.
 */
function guardarLlave(caja: CajaFuerte, llave: Llave, origen: string, rpNombre: string): string {
  const campo = { id: nuevoId(), clave: CLAVE_LLAVE, etiqueta: ETIQUETA_LLAVE, tipo: 'llave' as const, valor: escribirLlave(llave) }

  const mismaCuenta = buscarLlaves(caja, llave.rpId).find((g) => g.llave.usuarioId === llave.usuarioId)
  if (mismaCuenta) {
    const secciones: Seccion[] = mismaCuenta.elemento.secciones.map((s) => ({
      ...s,
      campos: s.campos.map((c) => (c.id === mismaCuenta.campoId ? { ...campo, id: c.id } : c))
    }))
    return caja.guardar({ ...mismaCuenta.elemento, secciones }).id
  }

  const suya = caja
    .listar()
    .filter((e) => e.estado === 'activo' && e.categoria === 'login' && e.webs.some((w) => mismoDominio(w, llave.rpId)))
    .map((e) => caja.obtener(e.id))
    .find((e) => llave.usuario !== '' && usuarioDe(e) === llave.usuario)
  if (suya) {
    const secciones = suya.secciones.map((s, i) => (i === 0 ? { ...s, campos: [...s.campos, campo] } : s))
    return caja.guardar({ ...suya, secciones }).id
  }

  const secciones = seccionesDePlantilla('login')
  for (const c of secciones[0].campos) if (c.clave === 'usuario') c.valor = llave.usuario
  secciones[0].campos.push(campo)
  return caja.guardar({
    bovedaId: caja.bovedas()[0].id,
    categoria: 'login',
    titulo: rpNombre.trim() || llave.rpId,
    webs: [origenLimpio(origen)],
    etiquetas: [],
    favorito: false,
    secciones,
    notas: ''
  }).id
}

/* ---------- Crear y firmar ---------- */

export function crearLlave(caja: CajaFuerte, p: PeticionCrearLlave): RespuestaCrearLlave {
  const rpId = rpIdDe(p.origen, p.rpId)
  if (!p.algoritmos.includes(ES256)) {
    throw new ErrorLlave('NotSupportedError', 'Esta web pide una llave de un tipo que CLAC no sabe hacer.')
  }
  const guardadas = buscarLlaves(caja, rpId)
  if (p.excluir.some((id) => guardadas.some((g) => g.llave.id === id))) {
    throw new ErrorLlave('InvalidStateError', 'Ya tienes una llave de esta web guardada en CLAC.')
  }

  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
  const credencialId = randomBytes(16)
  const llave: Llave = {
    v: 1,
    rpId,
    id: credencialId.toString('base64url'),
    usuarioId: Buffer.from(p.usuarioId, 'base64url').toString('base64url'),
    usuario: p.usuario,
    nombre: p.nombre ?? '',
    privada: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    creada: new Date().toISOString()
  }
  const elementoId = guardarLlave(caja, llave, p.origen, p.rpNombre ?? '')

  const cose = claveCose(Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url'))
  const datos = datosAutenticador(rpId, PRESENTE | VERIFICADO | RESPALDABLE | RESPALDADA | CON_CREDENCIAL, { id: credencialId, cose })
  const atestacion = cborMapa([
    [cborTexto('fmt'), cborTexto('none')],
    [cborTexto('attStmt'), cborMapa([])],
    [cborTexto('authData'), cborBytes(datos)]
  ])
  return {
    id: llave.id,
    elementoId,
    clientDataJSON: datosCliente('webauthn.create', retoDe(p.reto), p.origen).toString('base64url'),
    attestationObject: atestacion.toString('base64url'),
    authenticatorData: datos.toString('base64url'),
    clavePublica: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    algoritmo: ES256
  }
}

export function firmarLlave(caja: CajaFuerte, p: PeticionFirmarLlave): RespuestaFirmarLlave {
  const rpId = rpIdDe(p.origen, p.rpId)
  const guardada = buscarLlaves(caja, rpId).find((g) => g.llave.id === p.credencial)
  if (!guardada) throw new ErrorLlave('NotAllowedError', 'Esa llave ya no está en CLAC.')

  const cliente = datosCliente('webauthn.get', retoDe(p.reto), p.origen)
  const datos = datosAutenticador(rpId, PRESENTE | VERIFICADO | RESPALDABLE | RESPALDADA)
  const privada = createPrivateKey({ key: Buffer.from(guardada.llave.privada, 'base64'), format: 'der', type: 'pkcs8' })
  const firma = sign('sha256', Buffer.concat([datos, sha256(cliente)]), privada)
  caja.anotarUso(guardada.elemento.id)
  return {
    id: guardada.llave.id,
    elementoId: guardada.elemento.id,
    clientDataJSON: cliente.toString('base64url'),
    authenticatorData: datos.toString('base64url'),
    firma: firma.toString('base64url'),
    usuarioId: guardada.llave.usuarioId
  }
}

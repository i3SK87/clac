/**
 * Las llaves de acceso, en el mundo de la página.
 *
 * Este guion se ejecuta antes que nada de la web y cambia `navigator.credentials`
 * para poder ofrecer las llaves de CLAC cuando la página pida una. Es lo mismo
 * que hacen 1Password o Bitwarden, y no hay otra forma: la API de WebAuthn solo
 * se puede interceptar desde dentro de la propia página.
 *
 * Si la llave no la lleva CLAC —porque no la tienes guardada, porque la caja
 * está cerrada o porque prefieres la del ordenador o la del móvil—, se llama a
 * la función original y el navegador sigue con su flujo de siempre, como si
 * esto no estuviera.
 *
 * Aquí no hay ningún secreto: solo se traduce lo que la web pide a texto, se
 * pregunta fuera y se devuelve lo ya firmado con la forma que espera la web.
 */
import { PETICION, RESPUESTA, avisar, type DatosCrear, type DatosEntrar, type ResultadoPagina } from './llave-comun'
import type { RespuestaCrearLlave, RespuestaFirmarLlave } from '@shared/navegador'

/** ES256. Es la única que hace CLAC, y la que aceptan todas las webs. */
const ES256 = -7
const TRANSPORTES = ['internal', 'hybrid']

const contenedor = navigator.credentials
const crearNativo = contenedor.create.bind(contenedor)
const obtenerNativo = contenedor.get.bind(contenedor)

/* ---------- Pasar de bytes a texto y al revés ---------- */

function aB64u(dato: BufferSource): string {
  const bytes = dato instanceof ArrayBuffer ? new Uint8Array(dato) : new Uint8Array(dato.buffer, dato.byteOffset, dato.byteLength)
  let texto = ''
  for (const b of bytes) texto += String.fromCharCode(b)
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deB64u(texto: string): ArrayBuffer {
  const bruto = atob(texto.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bruto.length)
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  return bytes.buffer
}

/* ---------- Preguntar fuera ---------- */

let cuenta = 0

function preguntar(que: 'crear' | 'entrar', datos: DatosCrear | DatosEntrar, senal?: AbortSignal | null): Promise<ResultadoPagina | 'abortada'> {
  const id = `${Date.now().toString(36)}-${cuenta++}-${Math.random().toString(36).slice(2)}`
  return new Promise((resolver) => {
    const alResponder = (ev: Event): void => {
      const r = JSON.parse((ev as CustomEvent<string>).detail) as ResultadoPagina
      if (r.id !== id) return
      soltar()
      resolver(r)
    }
    const alAbortar = (): void => {
      soltar()
      avisar(PETICION, { id, que: 'cancelar' })
      resolver('abortada')
    }
    const soltar = (): void => {
      window.removeEventListener(RESPUESTA, alResponder)
      senal?.removeEventListener('abort', alAbortar)
    }
    window.addEventListener(RESPUESTA, alResponder)
    senal?.addEventListener('abort', alAbortar)
    avisar(PETICION, { id, que, datos })
  })
}

function abortada(senal?: AbortSignal | null): unknown {
  return senal?.reason ?? new DOMException('La web ha cancelado la petición.', 'AbortError')
}

/* ---------- Devolver lo que espera la web ---------- */

function definir(objeto: object, valores: Record<string, unknown>): void {
  for (const [nombre, valor] of Object.entries(valores)) {
    Object.defineProperty(objeto, nombre, { value: valor, enumerable: true, configurable: true })
  }
}

function credencial(id: string, respuesta: object, extensiones: object, aJson: () => unknown): PublicKeyCredential {
  const cred = Object.create(PublicKeyCredential.prototype) as PublicKeyCredential
  definir(cred, {
    id,
    rawId: deB64u(id),
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: respuesta,
    getClientExtensionResults: () => extensiones,
    toJSON: aJson
  })
  return cred
}

function credencialCreada(llave: RespuestaCrearLlave, pidioCredProps: boolean): PublicKeyCredential {
  const clientDataJSON = deB64u(llave.clientDataJSON)
  const attestationObject = deB64u(llave.attestationObject)
  const authenticatorData = deB64u(llave.authenticatorData)
  const clavePublica = deB64u(llave.clavePublica)
  const respuesta = Object.create(AuthenticatorAttestationResponse.prototype) as AuthenticatorAttestationResponse
  definir(respuesta, {
    clientDataJSON,
    attestationObject,
    getTransports: () => [...TRANSPORTES],
    getAuthenticatorData: () => authenticatorData,
    getPublicKey: () => clavePublica,
    getPublicKeyAlgorithm: () => llave.algoritmo
  })
  // `credProps.rk` dice que la llave se queda guardada y que basta con ella
  // para entrar, sin teclear antes el usuario. En CLAC siempre es así.
  const extensiones = pidioCredProps ? { credProps: { rk: true } } : {}
  return credencial(llave.id, respuesta, extensiones, () => ({
    id: llave.id,
    rawId: llave.id,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: {
      clientDataJSON: llave.clientDataJSON,
      attestationObject: llave.attestationObject,
      authenticatorData: llave.authenticatorData,
      publicKey: llave.clavePublica,
      publicKeyAlgorithm: llave.algoritmo,
      transports: [...TRANSPORTES]
    },
    clientExtensionResults: extensiones
  }))
}

function credencialEntrada(llave: RespuestaFirmarLlave): PublicKeyCredential {
  const respuesta = Object.create(AuthenticatorAssertionResponse.prototype) as AuthenticatorAssertionResponse
  definir(respuesta, {
    clientDataJSON: deB64u(llave.clientDataJSON),
    authenticatorData: deB64u(llave.authenticatorData),
    signature: deB64u(llave.firma),
    userHandle: llave.usuarioId ? deB64u(llave.usuarioId) : null
  })
  return credencial(llave.id, respuesta, {}, () => ({
    id: llave.id,
    rawId: llave.id,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: {
      clientDataJSON: llave.clientDataJSON,
      authenticatorData: llave.authenticatorData,
      signature: llave.firma,
      userHandle: llave.usuarioId || null
    },
    clientExtensionResults: {}
  }))
}

/* ---------- Las dos funciones que ve la web ---------- */

async function crear(opciones?: CredentialCreationOptions): Promise<Credential | null> {
  const pk = opciones?.publicKey
  // Sin llave de por medio, o en una web sin cifrar, esto no es asunto de CLAC.
  if (!pk || !window.isSecureContext) return crearNativo(opciones)
  // Si la web quiere una llave de las que se enchufan, que la pida el navegador.
  if (pk.authenticatorSelection?.authenticatorAttachment === 'cross-platform') return crearNativo(opciones)
  const algoritmos = (pk.pubKeyCredParams ?? []).map((p) => p.alg)
  if (algoritmos.length > 0 && !algoritmos.includes(ES256)) return crearNativo(opciones)

  let datos: DatosCrear
  try {
    datos = {
      rpId: pk.rp?.id,
      rpNombre: pk.rp?.name,
      usuarioId: aB64u(pk.user.id),
      usuario: pk.user.name ?? '',
      nombre: pk.user.displayName ?? '',
      reto: aB64u(pk.challenge),
      algoritmos,
      excluir: (pk.excludeCredentials ?? []).map((c) => aB64u(c.id))
    }
  } catch {
    // Si lo que pide la web no se entiende, que se lo diga el navegador con sus
    // propias palabras: aquí no se rompe nada que funcionara sin CLAC.
    return crearNativo(opciones)
  }
  const r = await preguntar('crear', datos, opciones?.signal)
  if (r === 'abortada') throw abortada(opciones?.signal)
  if (r.accion === 'navegador') return crearNativo(opciones)
  if (r.accion === 'error') throw new DOMException(r.mensaje, r.nombre)
  if (r.accion !== 'creada') return crearNativo(opciones)
  return credencialCreada(r.llave, !!(pk.extensions as { credProps?: boolean } | undefined)?.credProps)
}

async function obtener(opciones?: CredentialRequestOptions): Promise<Credential | null> {
  const pk = opciones?.publicKey
  if (!pk || !window.isSecureContext) return obtenerNativo(opciones)
  // El autorrelleno del propio campo de texto (`mediation: conditional`) lo
  // enseña el navegador dentro del formulario, y ahí CLAC no puede pintar nada:
  // se deja pasar tal cual. Cuando la web tiene un botón de «entrar con llave»,
  // que es lo normal, esa llamada sí llega aquí.
  if (opciones?.mediation === 'conditional') return obtenerNativo(opciones)

  let datos: DatosEntrar
  try {
    datos = {
      rpId: pk.rpId,
      reto: aB64u(pk.challenge),
      permitidas: (pk.allowCredentials ?? []).map((c) => aB64u(c.id))
    }
  } catch {
    return obtenerNativo(opciones)
  }
  const r = await preguntar('entrar', datos, opciones?.signal)
  if (r === 'abortada') throw abortada(opciones?.signal)
  if (r.accion === 'navegador') return obtenerNativo(opciones)
  if (r.accion === 'error') throw new DOMException(r.mensaje, r.nombre)
  if (r.accion !== 'entrada') return obtenerNativo(opciones)
  return credencialEntrada(r.llave)
}

// Se cambian en el prototipo: así vale igual si la web se guarda una copia de
// `navigator.credentials` en otro sitio.
Object.defineProperty(CredentialsContainer.prototype, 'create', { value: crear, writable: true, configurable: true })
Object.defineProperty(CredentialsContainer.prototype, 'get', { value: obtener, writable: true, configurable: true })

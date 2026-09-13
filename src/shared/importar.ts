/**
 * Traerse las contraseñas de donde estén ahora.
 *
 * Cada gestor exporta a su manera, y aquí se reconoce cuál es por la cabecera
 * del archivo, sin preguntar: Opera, Chrome, Edge y Brave (que comparten
 * formato), Firefox, Bitwarden en CSV o JSON, 1Password en CSV o en su .1pux,
 * KeePassXC, LastPass y la exportación de la propia CLAC.
 *
 * Lo que sale de aquí son elementos ya con la forma de la casa: la categoría
 * que toca, los campos con sus rótulos en castellano rellenos donde se sabe qué
 * es cada cosa, y lo que no se reconoce en una sección aparte con el nombre que
 * traía, para que no se pierda nada.
 */
import { comoObjetos, leerCsv } from './csv'
import { esCategoria, nuevoId, seccionesDePlantilla } from './categorias'
import type { Campo, CategoriaId, FormatoImportacion, Seccion, TipoCampo } from './tipos'

export interface AdjuntoImportado {
  nombre: string
  /** Dónde está dentro del .1pux; lo saca el proceso principal. */
  ruta: string
}

export interface Importado {
  categoria: CategoriaId
  titulo: string
  webs: string[]
  etiquetas: string[]
  favorito: boolean
  secciones: Seccion[]
  notas: string
  archivado: boolean
  adjuntos?: AdjuntoImportado[]
}

export interface Lectura {
  formato: FormatoImportacion
  elementos: Importado[]
  avisos: string[]
}

export const NOMBRES_FORMATO: Record<FormatoImportacion, string> = {
  chromium: 'Opera, Chrome, Edge o Brave',
  firefox: 'Firefox',
  'bitwarden-csv': 'Bitwarden (CSV)',
  'bitwarden-json': 'Bitwarden (JSON)',
  '1password-csv': '1Password (CSV)',
  '1pux': '1Password (.1pux)',
  keepass: 'KeePassXC',
  lastpass: 'LastPass',
  clac: 'CLAC'
}

/* ---------- Construir elementos ---------- */

interface Datos {
  categoria: CategoriaId
  titulo: string
  webs?: string[]
  etiquetas?: string[]
  favorito?: boolean
  notas?: string
  archivado?: boolean
  /** Valores para los campos de la plantilla, por su clave. */
  valores?: Record<string, string>
  totp?: string
  /** Lo que no tiene sitio en la plantilla, con el rótulo con el que venía. */
  otros?: Array<{ etiqueta: string; valor: string; tipo?: TipoCampo }>
  adjuntos?: AdjuntoImportado[]
}

export function construir(datos: Datos): Importado {
  const secciones = seccionesDePlantilla(datos.categoria)
  const principal = secciones[0]
  for (const campo of principal.campos) {
    const valor = datos.valores?.[campo.clave ?? '']
    if (valor) campo.valor = valor
  }
  // Los campos de la plantilla que no traían nada se quedan: es la ficha de
  // siempre, y rellenarla luego a mano es más fácil que volver a crear el campo.
  if (datos.totp?.trim()) {
    principal.campos.push({ id: nuevoId(), etiqueta: 'Código de un solo uso', tipo: 'totp', valor: datos.totp.trim() })
  }
  const otros = (datos.otros ?? []).filter((o) => o.valor.trim() !== '')
  if (otros.length) {
    secciones.push({
      id: nuevoId(),
      titulo: 'Otros datos',
      campos: otros.map((o) => ({ id: nuevoId(), etiqueta: o.etiqueta || 'Campo', tipo: o.tipo ?? 'texto', valor: o.valor }))
    })
  }
  const webs = (datos.webs ?? []).map((w) => w.trim()).filter(Boolean)
  return {
    categoria: datos.categoria,
    titulo: datos.titulo.trim() || tituloDeWeb(webs[0]) || 'Sin título',
    webs: [...new Set(webs)],
    etiquetas: [...new Set((datos.etiquetas ?? []).map((e) => e.trim()).filter(Boolean))],
    favorito: datos.favorito ?? false,
    secciones,
    notas: datos.notas?.trim() ?? '',
    archivado: datos.archivado ?? false,
    adjuntos: datos.adjuntos
  }
}

/** «accounts.google.com» → «google.com», para titular lo que llega sin título. */
function tituloDeWeb(web: string | undefined): string {
  if (!web) return ''
  try {
    const host = new URL(/^[a-z]+:\/\//i.test(web) ? web : `https://${web}`).hostname.replace(/^www\./, '')
    return host
  } catch {
    return web
  }
}

const verdadero = (v: string | undefined): boolean => /^(1|true|yes|sí|si|x)$/i.test((v ?? '').trim())

/* ---------- Detectar y leer ---------- */

/** Lee un archivo de texto (CSV o JSON). El .1pux lo abre el proceso principal y llama a `desde1pux`. */
export function leerExportacion(texto: string): Lectura {
  const limpio = texto.trim()
  if (limpio.startsWith('{')) {
    let json: unknown
    try {
      json = JSON.parse(limpio)
    } catch {
      throw new Error('El archivo parece JSON pero no se puede leer: puede que esté incompleto.')
    }
    const o = json as Record<string, unknown>
    if (o.formato === 'clac') return desdeClac(o)
    if (Array.isArray(o.items)) {
      if (o.encrypted === true) {
        throw new Error('Es una exportación de Bitwarden cifrada. Expórtala otra vez eligiendo «JSON» sin cifrar.')
      }
      return desdeBitwardenJson(o)
    }
    throw new Error('No reconozco este JSON. Admito las exportaciones de Bitwarden y de la propia CLAC.')
  }

  const { cabecera, registros } = comoObjetos(leerCsv(texto))
  const tiene = (...cols: string[]): boolean => cols.every((c) => cabecera.includes(c))

  if (tiene('login_uri', 'login_username', 'login_password')) return desdeBitwardenCsv(registros)
  if (tiene('title', 'url', 'username', 'password', 'otpauth')) return desde1PasswordCsv(registros)
  if (tiene('group', 'title', 'username', 'password', 'url')) return desdeKeepass(registros)
  if (tiene('url', 'username', 'password', 'extra', 'name', 'grouping')) return desdeLastpass(registros)
  if (tiene('url', 'username', 'password', 'httprealm')) return desdeFirefox(registros)
  if (tiene('name', 'url', 'username', 'password')) return desdeChromium(registros)

  throw new Error(
    'No reconozco el formato de este archivo. Admito las exportaciones de Opera, Chrome, Edge, Brave, Firefox, Bitwarden, 1Password, KeePassXC y LastPass.'
  )
}

function contarSaltados(saltados: number, avisos: string[]): void {
  if (saltados) avisos.push(`${saltados} ${saltados === 1 ? 'fila vacía se ha saltado' : 'filas vacías se han saltado'}.`)
}

function desdeChromium(registros: Array<Record<string, string>>): Lectura {
  const elementos: Importado[] = []
  let saltados = 0
  for (const r of registros) {
    if (!r.username && !r.password) {
      saltados++
      continue
    }
    elementos.push(
      construir({
        categoria: 'login',
        titulo: r.name,
        webs: [r.url],
        notas: r.note ?? r.notes,
        valores: { usuario: r.username, contrasena: r.password }
      })
    )
  }
  const avisos: string[] = []
  contarSaltados(saltados, avisos)
  return { formato: 'chromium', elementos, avisos }
}

function desdeFirefox(registros: Array<Record<string, string>>): Lectura {
  const elementos: Importado[] = []
  let saltados = 0
  for (const r of registros) {
    if (!r.username && !r.password) {
      saltados++
      continue
    }
    elementos.push(
      construir({
        categoria: 'login',
        titulo: '',
        webs: [r.url],
        valores: { usuario: r.username, contrasena: r.password }
      })
    )
  }
  const avisos: string[] = []
  contarSaltados(saltados, avisos)
  return { formato: 'firefox', elementos, avisos }
}

/** Los campos personalizados de Bitwarden en CSV: «nombre: valor», uno por línea. */
function camposBitwarden(texto: string): Array<{ etiqueta: string; valor: string }> {
  return texto
    .split(/\r?\n/)
    .map((linea) => {
      const i = linea.indexOf(': ')
      return i > 0 ? { etiqueta: linea.slice(0, i), valor: linea.slice(i + 2) } : { etiqueta: 'Campo', valor: linea }
    })
    .filter((c) => c.valor.trim())
}

function desdeBitwardenCsv(registros: Array<Record<string, string>>): Lectura {
  const elementos = registros.map((r) =>
    r.type === 'note'
      ? construir({
          categoria: 'nota',
          titulo: r.name,
          notas: r.notes,
          favorito: verdadero(r.favorite),
          etiquetas: r.folder ? [r.folder] : [],
          otros: camposBitwarden(r.fields ?? '')
        })
      : construir({
          categoria: 'login',
          titulo: r.name,
          webs: (r.login_uri ?? '').split(','),
          notas: r.notes,
          favorito: verdadero(r.favorite),
          etiquetas: r.folder ? [r.folder] : [],
          valores: { usuario: r.login_username, contrasena: r.login_password },
          totp: r.login_totp,
          otros: camposBitwarden(r.fields ?? '')
        })
  )
  return { formato: 'bitwarden-csv', elementos, avisos: [] }
}

function desde1PasswordCsv(registros: Array<Record<string, string>>): Lectura {
  const elementos = registros.map((r) =>
    construir({
      categoria: r.username || r.url ? 'login' : r.password ? 'contrasena' : 'nota',
      titulo: r.title,
      webs: [r.url],
      notas: r.notes,
      favorito: verdadero(r.favorite),
      archivado: verdadero(r.archived),
      etiquetas: (r.tags ?? '').split(/[;,]/),
      valores: { usuario: r.username, contrasena: r.password },
      totp: r.otpauth
    })
  )
  return {
    formato: '1password-csv',
    elementos,
    avisos: ['El CSV de 1Password solo lleva inicios de sesión y contraseñas. Para traerlo todo, exporta en formato .1pux.']
  }
}

function desdeKeepass(registros: Array<Record<string, string>>): Lectura {
  const elementos = registros.map((r) => {
    const grupo = (r.group ?? '').replace(/^Root\/?/i, '').trim()
    const conDatos = r.username || r.password || r.url
    return construir({
      categoria: conDatos ? 'login' : 'nota',
      titulo: r.title,
      webs: [r.url],
      notas: r.notes,
      etiquetas: grupo ? [grupo] : [],
      valores: { usuario: r.username, contrasena: r.password },
      totp: r.totp
    })
  })
  return { formato: 'keepass', elementos, avisos: [] }
}

function desdeLastpass(registros: Array<Record<string, string>>): Lectura {
  const elementos = registros.map((r) => {
    // Las notas seguras de LastPass llevan esta dirección de mentira.
    if ((r.url ?? '').trim() === 'http://sn') {
      return construir({ categoria: 'nota', titulo: r.name, notas: r.extra, favorito: verdadero(r.fav), etiquetas: [r.grouping] })
    }
    return construir({
      categoria: 'login',
      titulo: r.name,
      webs: [r.url],
      notas: r.extra,
      favorito: verdadero(r.fav),
      etiquetas: [r.grouping],
      valores: { usuario: r.username, contrasena: r.password },
      totp: r.totp
    })
  })
  return {
    formato: 'lastpass',
    elementos,
    avisos: [
      'Si estas contraseñas estaban en LastPass en 2022, pudieron salir en su filtración: conviene cambiar las importantes.'
    ]
  }
}

/* ---------- Bitwarden JSON ---------- */

interface BwItem {
  type: number
  name?: string
  notes?: string | null
  favorite?: boolean
  folderId?: string | null
  fields?: Array<{ name?: string; value?: string; type?: number }>
  login?: { username?: string; password?: string; totp?: string; uris?: Array<{ uri?: string }> }
  card?: { cardholderName?: string; brand?: string; number?: string; expMonth?: string; expYear?: string; code?: string }
  identity?: Record<string, string | null>
  sshKey?: { privateKey?: string; publicKey?: string; keyFingerprint?: string }
}

function desdeBitwardenJson(o: Record<string, unknown>): Lectura {
  const carpetas = new Map<string, string>(
    ((o.folders as Array<{ id: string; name: string }>) ?? []).map((f) => [f.id, f.name])
  )
  const avisos: string[] = []
  const elementos: Importado[] = []
  for (const it of o.items as BwItem[]) {
    const etiquetas = it.folderId && carpetas.get(it.folderId) ? [carpetas.get(it.folderId)!] : []
    const otros = (it.fields ?? []).map((f) => ({
      etiqueta: f.name ?? 'Campo',
      valor: f.value ?? '',
      tipo: (f.type === 1 ? 'oculto' : 'texto') as TipoCampo
    }))
    const base = { titulo: it.name ?? '', notas: it.notes ?? '', favorito: !!it.favorite, etiquetas, otros }
    if (it.type === 1) {
      elementos.push(
        construir({
          ...base,
          categoria: 'login',
          webs: (it.login?.uris ?? []).map((u) => u.uri ?? ''),
          valores: { usuario: it.login?.username ?? '', contrasena: it.login?.password ?? '' },
          totp: it.login?.totp ?? ''
        })
      )
    } else if (it.type === 2) {
      elementos.push(construir({ ...base, categoria: 'nota' }))
    } else if (it.type === 3) {
      const c = it.card ?? {}
      const mes = (c.expMonth ?? '').padStart(2, '0')
      elementos.push(
        construir({
          ...base,
          categoria: 'tarjeta',
          valores: {
            titular: c.cardholderName ?? '',
            numero: c.number ?? '',
            marca: c.brand ?? '',
            cvv: c.code ?? '',
            caducidad: c.expYear && c.expMonth ? `${c.expYear}-${mes}` : ''
          }
        })
      )
    } else if (it.type === 4) {
      const i = it.identity ?? {}
      const v = (k: string): string => i[k] ?? ''
      elementos.push(
        construir({
          ...base,
          categoria: 'identidad',
          valores: {
            nombre: [v('firstName'), v('middleName')].filter(Boolean).join(' '),
            apellidos: v('lastName'),
            correo: v('email'),
            telefono: v('phone'),
            direccion: [v('address1'), v('address2'), v('address3')].filter(Boolean).join(', '),
            cp: v('postalCode'),
            ciudad: v('city'),
            provincia: v('state'),
            pais: v('country')
          },
          otros: [
            ...otros,
            { etiqueta: 'Empresa', valor: v('company') },
            { etiqueta: 'Usuario', valor: v('username') },
            { etiqueta: 'Número de pasaporte', valor: v('passportNumber') },
            { etiqueta: 'Número de carné de conducir', valor: v('licenseNumber') },
            { etiqueta: 'Número de la Seguridad Social', valor: v('ssn') }
          ]
        })
      )
    } else if (it.type === 5) {
      elementos.push(
        construir({
          ...base,
          categoria: 'ssh',
          valores: {
            privada: it.sshKey?.privateKey ?? '',
            publica: it.sshKey?.publicKey ?? '',
            huella: it.sshKey?.keyFingerprint ?? ''
          }
        })
      )
    }
  }
  const raros = (o.items as BwItem[]).filter((it) => ![1, 2, 3, 4, 5].includes(it.type)).length
  if (raros) avisos.push(`${raros} elementos de un tipo desconocido se han saltado.`)
  return { formato: 'bitwarden-json', elementos, avisos }
}

/* ---------- 1Password .1pux ---------- */

const CATEGORIA_1PUX: Record<string, CategoriaId> = {
  '001': 'login',
  '002': 'tarjeta',
  '003': 'nota',
  '004': 'identidad',
  '005': 'contrasena',
  '006': 'documento',
  '100': 'software',
  '101': 'banco',
  '102': 'basedatos',
  '103': 'carne',
  '104': 'licenciaCaza',
  '105': 'membresia',
  '106': 'pasaporte',
  '107': 'membresia',
  '108': 'seguridadSocial',
  '109': 'wifi',
  '110': 'servidor',
  '111': 'correo',
  '112': 'api',
  '113': 'medico',
  '114': 'ssh',
  '115': 'cripto'
}

/**
 * Los identificadores de campo de 1Password que tienen sitio en nuestras
 * plantillas. El resto va a «Otros datos» con el título que traía.
 */
const CLAVE_1PUX: Record<string, string> = {
  username: 'usuario',
  password: 'contrasena',
  cardholder: 'titular',
  ccnum: 'numero',
  type: 'marca',
  cvv: 'cvv',
  expiry: 'caducidad',
  pin: 'pin',
  bank: 'banco',
  firstname: 'nombre',
  lastname: 'apellidos',
  birthdate: 'nacimiento',
  email: 'correo',
  defphone: 'telefono',
  bankName: 'banco',
  owner: 'titular',
  iban: 'iban',
  swift: 'bic',
  telephonePin: 'pin',
  number: 'numero',
  fullname: 'nombre',
  name: 'nombre',
  expiry_date: 'caducidad',
  issue_date: 'expedicion',
  nationality: 'nacionalidad',
  issuing_country: 'pais',
  class: 'permisos',
  network_name: 'red',
  wireless_password: 'contrasena',
  wireless_security: 'seguridad',
  server: 'servidor',
  port: 'puerto',
  database: 'base',
  database_type: 'tipo',
  pop_username: 'usuario',
  pop_password: 'contrasena',
  pop_server: 'servidor',
  pop_port: 'puerto',
  smtp_server: 'servidorSalida',
  smtp_port: 'puertoSalida',
  pop_security: 'seguridad',
  reg_code: 'clave',
  product_version: 'version',
  reg_name: 'titular',
  reg_email: 'correo',
  order_date: 'compra',
  org_name: 'entidad',
  member_name: 'nombre',
  membership_no: 'numero',
  recoveryPhrase: 'frase',
  walletAddress: 'direccion',
  credential: 'credencial',
  hostname: 'servidor',
  expires: 'caducidad',
  admin_console_url: 'panel',
  url: 'panel',
  private_key: 'privada',
  public_key: 'publica',
  fingerprint: 'huella',
  key_type: 'tipo'
}

type ValorPux = Record<string, unknown>

/** De la forma de 1Password («{ concealed: "…" }», «{ date: 1700000000 }»…) a texto y tipo nuestros. */
function valorPux(valor: ValorPux | undefined): { valor: string; tipo: TipoCampo } {
  if (!valor) return { valor: '', tipo: 'texto' }
  const [clase, dato] = Object.entries(valor)[0] ?? ['string', '']
  switch (clase) {
    case 'concealed':
      return { valor: String(dato ?? ''), tipo: 'oculto' }
    case 'totp':
      return { valor: String(dato ?? ''), tipo: 'totp' }
    case 'email': {
      const d = dato as { email_address?: string } | string
      return { valor: typeof d === 'string' ? d : (d?.email_address ?? ''), tipo: 'correo' }
    }
    case 'url':
      return { valor: String(dato ?? ''), tipo: 'url' }
    case 'phone':
      return { valor: String(dato ?? ''), tipo: 'telefono' }
    case 'date': {
      const n = Number(dato)
      if (!n) return { valor: '', tipo: 'fecha' }
      const d = new Date(n * 1000)
      return {
        valor: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
        tipo: 'fecha'
      }
    }
    case 'monthYear': {
      const n = String(dato ?? '')
      return { valor: n.length === 6 ? `${n.slice(0, 4)}-${n.slice(4)}` : n, tipo: 'mesAnio' }
    }
    case 'address': {
      const a = (dato ?? {}) as Record<string, string>
      return {
        valor: [a.street, a.zip, a.city, a.state, a.country].filter(Boolean).join(', '),
        tipo: 'texto'
      }
    }
    case 'sshKey': {
      const k = (dato ?? {}) as { privateKey?: string }
      return { valor: k.privateKey ?? '', tipo: 'ocultoMultilinea' }
    }
    default:
      return { valor: typeof dato === 'string' || typeof dato === 'number' ? String(dato) : '', tipo: 'texto' }
  }
}

interface PuxItem {
  uuid?: string
  favIndex?: number
  state?: string
  categoryUuid?: string
  overview?: { title?: string; url?: string; urls?: Array<{ url?: string }>; tags?: string[] }
  details?: {
    loginFields?: Array<{ value?: string; designation?: string; name?: string; fieldType?: string }>
    notesPlain?: string
    password?: string
    sections?: Array<{ title?: string; fields?: Array<{ title?: string; id?: string; value?: ValorPux }> }>
    documentAttributes?: { fileName?: string; documentId?: string }
  }
}

export function desde1pux(exportData: unknown): Lectura {
  const datos = exportData as { accounts?: Array<{ vaults?: Array<{ attrs?: { name?: string }; items?: PuxItem[] }> }> }
  const elementos: Importado[] = []
  const avisos: string[] = []
  let desconocidos = 0

  for (const cuenta of datos.accounts ?? []) {
    for (const boveda of cuenta.vaults ?? []) {
      for (const it of boveda.items ?? []) {
        if (it.state === 'trashed') continue
        const cat = CATEGORIA_1PUX[it.categoryUuid ?? '']
        if (!cat) {
          desconocidos++
          continue
        }
        const valores: Record<string, string> = {}
        const otros: Array<{ etiqueta: string; valor: string; tipo?: TipoCampo }> = []
        let totp = ''

        for (const f of it.details?.loginFields ?? []) {
          if (f.designation === 'username') valores.usuario = f.value ?? ''
          else if (f.designation === 'password') valores.contrasena = f.value ?? ''
        }
        if (it.details?.password) valores.contrasena = it.details.password

        for (const seccion of it.details?.sections ?? []) {
          for (const f of seccion.fields ?? []) {
            const { valor, tipo } = valorPux(f.value)
            if (!valor) continue
            if (tipo === 'totp' && !totp) {
              totp = valor
              continue
            }
            const clave = CLAVE_1PUX[f.id ?? '']
            if (clave && !valores[clave]) valores[clave] = valor
            else otros.push({ etiqueta: f.title || seccion.title || 'Campo', valor, tipo })
          }
        }

        const doc = it.details?.documentAttributes
        const adjuntos =
          doc?.documentId && doc.fileName
            ? [{ nombre: doc.fileName, ruta: `files/${doc.documentId}__${doc.fileName}` }]
            : undefined

        const webs = [it.overview?.url ?? '', ...(it.overview?.urls ?? []).map((u) => u.url ?? '')]
        elementos.push(
          construir({
            categoria: cat,
            titulo: it.overview?.title ?? '',
            webs,
            etiquetas: [...(it.overview?.tags ?? [])],
            favorito: (it.favIndex ?? 0) > 0,
            archivado: it.state === 'archived',
            notas: it.details?.notesPlain ?? '',
            valores,
            totp,
            otros,
            adjuntos
          })
        )
      }
    }
  }
  if (desconocidos) avisos.push(`${desconocidos} elementos de una categoría que no existe aquí se han saltado.`)
  return { formato: '1pux', elementos, avisos }
}

/* ---------- La propia CLAC ---------- */

interface ClacExportado {
  categoria?: string
  titulo?: string
  webs?: string[]
  etiquetas?: string[]
  favorito?: boolean
  estado?: string
  notas?: string
  secciones?: Seccion[]
  boveda?: string
}

function desdeClac(o: Record<string, unknown>): Lectura {
  const lista = (o.elementos as ClacExportado[]) ?? []
  const elementos: Importado[] = []
  for (const e of lista) {
    if (!esCategoria(e.categoria)) continue
    // Se les dan identificadores nuevos: los de la otra caja fuerte no valen aquí.
    const secciones: Seccion[] = (e.secciones ?? []).map((s) => ({
      id: nuevoId(),
      titulo: s.titulo ?? '',
      campos: (s.campos ?? []).map((c: Campo) => ({ ...c, id: nuevoId() }))
    }))
    elementos.push({
      categoria: e.categoria,
      titulo: e.titulo ?? 'Sin título',
      webs: e.webs ?? [],
      etiquetas: e.etiquetas ?? [],
      favorito: !!e.favorito,
      archivado: e.estado === 'archivado',
      notas: e.notas ?? '',
      secciones: secciones.length ? secciones : seccionesDePlantilla(e.categoria)
    })
  }
  return { formato: 'clac', elementos, avisos: [] }
}

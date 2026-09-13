/**
 * Las categorías de elemento y los campos con los que nace cada una.
 *
 * Son las veintiuna de 1Password, pasadas a lo que se usa en España: la cuenta
 * bancaria lleva IBAN y BIC en vez de número de ruta, la de la Seguridad Social
 * es el NUSS y no el número de la estadounidense, y la licencia de caza y pesca
 * pregunta por la comunidad autónoma. Y una que 1Password no tiene y aquí es la
 * primera que se busca: el DNI.
 *
 * La plantilla solo decide con qué campos nace un elemento. Después, cada uno
 * es suyo: se le pueden quitar campos, añadir otros y abrir secciones nuevas.
 */
import type { Campo, CategoriaId, Detalle, Seccion, TipoCampo } from './tipos'

interface CampoPlantilla {
  clave: string
  etiqueta: string
  tipo: TipoCampo
}

export interface Categoria {
  id: CategoriaId
  nombre: string
  /** En plural, para la barra lateral. */
  plural: string
  /** Nombre del icono de Lucide; la ventana lo traduce a su dibujo. */
  icono: string
  /** El color del avatar cuando el elemento no tiene web de la que sacar uno. */
  color: string
  campos: CampoPlantilla[]
  /** Si la categoría usa webs (las de inicio de sesión, sobre todo). */
  webs: boolean
  /**
   * Cuántos meses antes de caducar avisa Watchtower. Los de 1Password: dos para
   * tarjetas, membresías y licencias; tres para credenciales; diez para
   * pasaportes, que renovarlos lleva su tiempo. Al DNI le pasa lo mismo.
   */
  avisoCaducidadMeses?: number
}

const c = (clave: string, etiqueta: string, tipo: TipoCampo = 'texto'): CampoPlantilla => ({
  clave,
  etiqueta,
  tipo
})

export const CATEGORIAS: Categoria[] = [
  {
    id: 'login',
    nombre: 'Inicio de sesión',
    plural: 'Inicios de sesión',
    icono: 'key-round',
    color: '#2f7de1',
    webs: true,
    campos: [c('usuario', 'Usuario'), c('contrasena', 'Contraseña', 'oculto')]
  },
  {
    id: 'contrasena',
    nombre: 'Contraseña',
    plural: 'Contraseñas',
    icono: 'asterisk',
    color: '#6b5bd6',
    webs: false,
    campos: [c('contrasena', 'Contraseña', 'oculto')]
  },
  {
    id: 'nota',
    nombre: 'Nota segura',
    plural: 'Notas seguras',
    icono: 'notebook-pen',
    color: '#c98a12',
    webs: false,
    campos: []
  },
  {
    id: 'tarjeta',
    nombre: 'Tarjeta',
    plural: 'Tarjetas',
    icono: 'credit-card',
    color: '#1f8a5b',
    webs: false,
    avisoCaducidadMeses: 2,
    campos: [
      c('titular', 'Titular'),
      c('numero', 'Número', 'oculto'),
      c('marca', 'Tipo'),
      c('caducidad', 'Caducidad', 'mesAnio'),
      c('cvv', 'Código de seguridad', 'oculto'),
      c('pin', 'PIN', 'oculto'),
      c('banco', 'Banco emisor')
    ]
  },
  {
    id: 'identidad',
    nombre: 'Identidad',
    plural: 'Identidades',
    icono: 'contact-round',
    color: '#0f8a8a',
    webs: false,
    campos: [
      c('nombre', 'Nombre'),
      c('apellidos', 'Apellidos'),
      c('nacimiento', 'Fecha de nacimiento', 'fecha'),
      c('correo', 'Correo', 'correo'),
      c('telefono', 'Teléfono', 'telefono'),
      c('direccion', 'Dirección'),
      c('cp', 'Código postal'),
      c('ciudad', 'Localidad'),
      c('provincia', 'Provincia'),
      c('pais', 'País')
    ]
  },
  {
    id: 'dni',
    nombre: 'DNI / NIE',
    plural: 'DNI y NIE',
    icono: 'id-card',
    color: '#b8452e',
    webs: false,
    avisoCaducidadMeses: 10,
    campos: [
      c('numero', 'Número'),
      c('nombre', 'Nombre completo'),
      c('soporte', 'Número de soporte'),
      c('expedicion', 'Fecha de expedición', 'fecha'),
      c('caducidad', 'Caducidad', 'fecha')
    ]
  },
  {
    id: 'pasaporte',
    nombre: 'Pasaporte',
    plural: 'Pasaportes',
    icono: 'book-user',
    color: '#8a3b8f',
    webs: false,
    avisoCaducidadMeses: 10,
    campos: [
      c('numero', 'Número'),
      c('nombre', 'Nombre completo'),
      c('nacionalidad', 'Nacionalidad'),
      c('pais', 'País emisor'),
      c('expedicion', 'Fecha de expedición', 'fecha'),
      c('caducidad', 'Caducidad', 'fecha')
    ]
  },
  {
    id: 'carne',
    nombre: 'Carné de conducir',
    plural: 'Carnés de conducir',
    icono: 'car-front',
    color: '#3f6fb0',
    webs: false,
    avisoCaducidadMeses: 2,
    campos: [
      c('numero', 'Número'),
      c('nombre', 'Nombre completo'),
      c('permisos', 'Permisos'),
      c('expedicion', 'Fecha de expedición', 'fecha'),
      c('caducidad', 'Caducidad', 'fecha')
    ]
  },
  {
    id: 'seguridadSocial',
    nombre: 'Seguridad Social',
    plural: 'Seguridad Social',
    icono: 'shield-plus',
    color: '#2c7f6f',
    webs: false,
    campos: [c('nombre', 'Nombre completo'), c('numero', 'Número de afiliación (NUSS)')]
  },
  {
    id: 'banco',
    nombre: 'Cuenta bancaria',
    plural: 'Cuentas bancarias',
    icono: 'landmark',
    color: '#246b45',
    webs: false,
    campos: [
      c('banco', 'Banco'),
      c('titular', 'Titular'),
      c('iban', 'IBAN'),
      c('bic', 'BIC / SWIFT'),
      c('pin', 'PIN', 'oculto'),
      c('telefono', 'Teléfono del banco', 'telefono')
    ]
  },
  {
    id: 'cripto',
    nombre: 'Monedero cripto',
    plural: 'Monederos cripto',
    icono: 'bitcoin',
    color: '#c7741a',
    webs: false,
    campos: [
      c('frase', 'Frase de recuperación', 'ocultoMultilinea'),
      c('contrasena', 'Contraseña', 'oculto'),
      c('direccion', 'Dirección del monedero')
    ]
  },
  {
    id: 'documento',
    nombre: 'Documento',
    plural: 'Documentos',
    icono: 'file-lock',
    color: '#5d6878',
    webs: false,
    campos: []
  },
  {
    id: 'wifi',
    nombre: 'Red wifi',
    plural: 'Redes wifi',
    icono: 'wifi',
    color: '#1d7fb3',
    webs: false,
    campos: [
      c('red', 'Nombre de la red'),
      c('contrasena', 'Contraseña de la red', 'oculto'),
      c('seguridad', 'Seguridad'),
      c('router', 'Dirección del router', 'url'),
      c('usuarioRouter', 'Usuario del router'),
      c('contrasenaRouter', 'Contraseña del router', 'oculto')
    ]
  },
  {
    id: 'software',
    nombre: 'Licencia de software',
    plural: 'Licencias de software',
    icono: 'app-window',
    color: '#4b5bb3',
    webs: true,
    avisoCaducidadMeses: 2,
    campos: [
      c('clave', 'Clave de licencia', 'ocultoMultilinea'),
      c('version', 'Versión'),
      c('titular', 'A nombre de'),
      c('correo', 'Correo registrado', 'correo'),
      c('compra', 'Fecha de compra', 'fecha'),
      c('caducidad', 'Caducidad', 'fecha')
    ]
  },
  {
    id: 'correo',
    nombre: 'Cuenta de correo',
    plural: 'Cuentas de correo',
    icono: 'mail',
    color: '#c24b4b',
    webs: false,
    campos: [
      c('usuario', 'Usuario', 'correo'),
      c('contrasena', 'Contraseña', 'oculto'),
      c('servidor', 'Servidor de entrada'),
      c('puerto', 'Puerto de entrada'),
      c('servidorSalida', 'Servidor de salida (SMTP)'),
      c('puertoSalida', 'Puerto de salida'),
      c('seguridad', 'Seguridad')
    ]
  },
  {
    id: 'servidor',
    nombre: 'Servidor',
    plural: 'Servidores',
    icono: 'server',
    color: '#4a5563',
    webs: true,
    campos: [c('usuario', 'Usuario'), c('contrasena', 'Contraseña', 'oculto'), c('panel', 'Panel de administración', 'url')]
  },
  {
    id: 'basedatos',
    nombre: 'Base de datos',
    plural: 'Bases de datos',
    icono: 'database',
    color: '#3b6f8f',
    webs: false,
    campos: [
      c('tipo', 'Tipo'),
      c('servidor', 'Servidor'),
      c('puerto', 'Puerto'),
      c('base', 'Base de datos'),
      c('usuario', 'Usuario'),
      c('contrasena', 'Contraseña', 'oculto')
    ]
  },
  {
    id: 'api',
    nombre: 'Credencial de API',
    plural: 'Credenciales de API',
    icono: 'braces',
    color: '#7a4fb5',
    webs: true,
    avisoCaducidadMeses: 3,
    campos: [
      c('usuario', 'Usuario'),
      c('credencial', 'Credencial', 'oculto'),
      c('tipo', 'Tipo'),
      c('servidor', 'Servidor'),
      c('caducidad', 'Caducidad', 'fecha')
    ]
  },
  {
    id: 'ssh',
    nombre: 'Clave SSH',
    plural: 'Claves SSH',
    icono: 'terminal',
    color: '#2b2f36',
    webs: false,
    campos: [
      c('privada', 'Clave privada', 'ocultoMultilinea'),
      c('publica', 'Clave pública', 'multilinea'),
      c('huella', 'Huella'),
      c('tipo', 'Tipo de clave')
    ]
  },
  {
    id: 'membresia',
    nombre: 'Membresía',
    plural: 'Membresías',
    icono: 'badge-check',
    color: '#a0527a',
    webs: true,
    avisoCaducidadMeses: 2,
    campos: [
      c('entidad', 'Entidad'),
      c('nombre', 'Nombre'),
      c('numero', 'Número de socio'),
      c('pin', 'PIN', 'oculto'),
      c('telefono', 'Teléfono', 'telefono'),
      c('caducidad', 'Caducidad', 'fecha')
    ]
  },
  {
    id: 'medico',
    nombre: 'Historial médico',
    plural: 'Historial médico',
    icono: 'stethoscope',
    color: '#c0392b',
    webs: false,
    campos: [
      c('fecha', 'Fecha', 'fecha'),
      c('centro', 'Centro'),
      c('profesional', 'Profesional'),
      c('motivo', 'Motivo de la consulta')
    ]
  },
  {
    id: 'licenciaCaza',
    nombre: 'Licencia de caza y pesca',
    plural: 'Licencias de caza y pesca',
    icono: 'fish',
    color: '#5b7d2b',
    webs: false,
    avisoCaducidadMeses: 2,
    campos: [
      c('numero', 'Número'),
      c('tipo', 'Tipo de licencia'),
      c('comunidad', 'Comunidad autónoma'),
      c('caducidad', 'Caducidad', 'fecha')
    ]
  }
]

const POR_ID = new Map(CATEGORIAS.map((cat) => [cat.id, cat]))

export function categoria(id: CategoriaId): Categoria {
  return POR_ID.get(id) ?? CATEGORIAS[0]
}

export function esCategoria(valor: unknown): valor is CategoriaId {
  return typeof valor === 'string' && POR_ID.has(valor as CategoriaId)
}

/** Un identificador corto y único, para campos, secciones y elementos. */
export function nuevoId(): string {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Los campos con los que nace un elemento de esta categoría, vacíos. */
export function seccionesDePlantilla(id: CategoriaId): Seccion[] {
  const campos: Campo[] = categoria(id).campos.map((p) => ({
    id: nuevoId(),
    clave: p.clave,
    etiqueta: p.etiqueta,
    tipo: p.tipo,
    valor: ''
  }))
  return [{ id: nuevoId(), titulo: '', campos }]
}

/* ---------- Leer un elemento ---------- */

export function todosLosCampos(detalle: Pick<Detalle, 'secciones'>): Campo[] {
  return detalle.secciones.flatMap((s) => s.campos)
}

/** El primer campo con esa clave que tenga algo escrito. */
export function campoPorClave(detalle: Pick<Detalle, 'secciones'>, clave: string): Campo | undefined {
  return todosLosCampos(detalle).find((f) => f.clave === clave && f.valor.trim() !== '')
}

/** El usuario, la cosa que se copia con Ctrl+C. */
export function usuarioDe(detalle: Pick<Detalle, 'secciones'>): string {
  return campoPorClave(detalle, 'usuario')?.valor ?? ''
}

/**
 * La contraseña «de verdad» del elemento: la que revisa Watchtower y la que se
 * copia con Ctrl+Mayús+C. En un router es la de la red, no la del router.
 */
export function contrasenaDe(detalle: Pick<Detalle, 'secciones'>): string {
  return campoPorClave(detalle, 'contrasena')?.valor ?? ''
}

export function totpDe(detalle: Pick<Detalle, 'secciones'>): string {
  return todosLosCampos(detalle).find((f) => f.tipo === 'totp' && f.valor.trim() !== '')?.valor ?? ''
}

/** Lo que se lee bajo el título en la lista. */
export function subtituloDe(categoriaId: CategoriaId, detalle: Pick<Detalle, 'secciones' | 'notas'>): string {
  const valor = (clave: string): string => campoPorClave(detalle, clave)?.valor.trim() ?? ''
  switch (categoriaId) {
    case 'tarjeta': {
      const numero = valor('numero').replace(/\s+/g, '')
      return numero ? `•••• ${numero.slice(-4)}` : valor('titular')
    }
    case 'banco': {
      const iban = valor('iban').replace(/\s+/g, '')
      return iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : valor('banco')
    }
    case 'identidad':
      return [valor('nombre'), valor('apellidos')].filter(Boolean).join(' ')
    case 'dni':
    case 'pasaporte':
    case 'carne':
      return valor('nombre') || valor('numero')
    case 'seguridadSocial':
      return valor('nombre')
    case 'wifi':
      return valor('red')
    case 'software':
      return valor('version') || valor('titular')
    case 'basedatos':
      return [valor('tipo'), valor('servidor')].filter(Boolean).join(' · ')
    case 'membresia':
      return valor('entidad') || valor('numero')
    case 'medico':
      return valor('centro') || valor('profesional')
    case 'licenciaCaza':
      return valor('tipo') || valor('numero')
    case 'ssh':
      return valor('tipo') || valor('huella')
    case 'cripto':
      return valor('direccion')
    case 'nota':
      return detalle.notas.split('\n').find((l) => l.trim())?.trim().slice(0, 80) ?? ''
    default:
      return valor('usuario') || valor('servidor')
  }
}

/* ---------- Iconos de caja fuerte ---------- */

export const ICONOS_BOVEDA = ['vault', 'house', 'briefcase', 'user', 'users', 'plane', 'heart', 'star', 'code', 'gamepad-2']
export const COLORES_BOVEDA = ['#2f7de1', '#1f8a5b', '#c98a12', '#c24b4b', '#7a4fb5', '#0f8a8a', '#a0527a', '#5d6878']

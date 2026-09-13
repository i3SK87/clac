/**
 * Lo que viaja entre el proceso principal y la ventana.
 *
 * Un elemento se guarda en dos mitades cifradas por separado, como en
 * 1Password: el **resumen** (lo que hace falta para listar y buscar) y el
 * **detalle** (los campos y las notas). La lista solo descifra resúmenes; el
 * detalle se abre al entrar en el elemento.
 */
import type { Paleta } from 'casa/paletas'

export type CategoriaId =
  | 'login'
  | 'contrasena'
  | 'nota'
  | 'tarjeta'
  | 'identidad'
  | 'dni'
  | 'pasaporte'
  | 'carne'
  | 'seguridadSocial'
  | 'banco'
  | 'cripto'
  | 'documento'
  | 'wifi'
  | 'software'
  | 'correo'
  | 'servidor'
  | 'basedatos'
  | 'api'
  | 'ssh'
  | 'membresia'
  | 'medico'
  | 'licenciaCaza'

export type TipoCampo =
  | 'texto'
  | 'oculto'
  | 'correo'
  | 'url'
  | 'telefono'
  | 'fecha'
  | 'mesAnio'
  | 'totp'
  | 'multilinea'
  | 'ocultoMultilinea'

export interface Campo {
  id: string
  /**
   * Qué es este campo para la aplicación, cuando lo sabe: «usuario»,
   * «contrasena», «caducidad»… Lo ponen las plantillas de cada categoría y es
   * lo que usan el subtítulo de la lista, Watchtower y los atajos de copiar.
   * Los campos que añade uno a mano no llevan.
   */
  clave?: string
  etiqueta: string
  tipo: TipoCampo
  valor: string
}

export interface Seccion {
  id: string
  /** La primera sección de cada elemento va sin título: son sus campos de siempre. */
  titulo: string
  campos: Campo[]
}

export type EstadoElemento = 'activo' | 'archivado' | 'eliminado'

/** La mitad del elemento que se descifra para listar. */
export interface Resumen {
  titulo: string
  categoria: CategoriaId
  /** Lo que se lee debajo del título en la lista: el usuario, «•••• 4242»… */
  subtitulo: string
  webs: string[]
  etiquetas: string[]
  favorito: boolean
  tieneTotp: boolean
}

/** La otra mitad, que solo se abre al entrar en el elemento. */
export interface Detalle {
  secciones: Seccion[]
  notas: string
}

export interface ElementoLista extends Resumen {
  id: string
  bovedaId: string
  estado: EstadoElemento
  creado: string
  modificado: string
  /** Última vez que se copió o se abrió algo suyo. */
  usado: string | null
  usos: number
  adjuntos: number
  eliminadoEn: string | null
}

export interface AdjuntoInfo {
  id: string
  nombre: string
  tipo: string
  tamano: number
  creado: string
}

export interface Elemento extends ElementoLista, Detalle {
  adjuntosInfo: AdjuntoInfo[]
}

/** Lo que manda la ventana para crear o guardar un elemento. */
export interface ElementoEntrada {
  id?: string
  bovedaId: string
  categoria: CategoriaId
  titulo: string
  webs: string[]
  etiquetas: string[]
  favorito: boolean
  secciones: Seccion[]
  notas: string
}

export interface VersionHistorial {
  id: string
  fecha: string
  titulo: string
  /** El elemento tal y como estaba justo antes de guardar encima. */
  resumen: Resumen
  detalle: Detalle
}

export interface Boveda {
  id: string
  nombre: string
  descripcion: string
  /** Nombre de un icono de Lucide de la lista de `ICONOS_BOVEDA`. */
  icono: string
  color: string
  orden: number
  creada: string
}

export interface BovedaEntrada {
  id?: string
  nombre: string
  descripcion: string
  icono: string
  color: string
}

/* ---------- Estado de la caja fuerte ---------- */

/**
 * - `nueva`: no hay caja fuerte todavía; toca crearla.
 * - `bloqueada`: la hay, y la clave secreta de este equipo está guardada.
 * - `sinClave`: la hay, pero en este equipo falta la clave secreta —se ha
 *   traído la carpeta de otro ordenador— y hay que escribirla del kit.
 * - `abierta`: desbloqueada.
 */
export type EstadoSesion = 'nueva' | 'bloqueada' | 'sinClave' | 'abierta'

/* ---------- Ajustes ---------- */

export type Tema = 'system' | 'light' | 'dark'
export type OrdenLista = 'titulo' | 'modificado' | 'usado'

export interface Ajustes {
  theme: Tema
  palette: Paleta
  /** Minutos sin tocar teclado ni ratón antes de bloquear. 0: nunca. */
  bloqueoMinutos: number
  bloquearAlSuspender: boolean
  bloquearAlBloquearWindows: boolean
  /** Segundos hasta vaciar el portapapeles. 0: nunca. */
  portapapelesSegundos: number
  accesoRapido: boolean
  arrancarConWindows: boolean
  /** El aspa esconde en la bandeja: el acceso rápido necesita la aplicación viva. */
  cerrarABandeja: boolean
  ordenLista: OrdenLista
  ultimaCopia: string | null
}

/* ---------- Watchtower ---------- */

export type TipoAlerta = 'filtrada' | 'debil' | 'repetida' | 'sinCifrar' | 'caducada' | 'caduca' | 'duplicado'

export interface ElementoAlerta {
  id: string
  titulo: string
  subtitulo: string
  categoria: CategoriaId
  webs: string[]
  /** La coletilla de cada alerta: «caducó el 3 de mayo», «repetida en 4»… */
  nota?: string
  /** Para agrupar las repetidas: los que comparten contraseña llevan el mismo. */
  grupo?: number
}

export interface GrupoAlerta {
  tipo: TipoAlerta
  elementos: ElementoAlerta[]
}

export interface InformeWatchtower {
  /** De 0 a 100: qué parte de lo revisado está limpio. */
  puntuacion: number
  revisados: number
  conProblemas: number
  grupos: GrupoAlerta[]
  /** Cuándo se consultaron las filtraciones por última vez. Nunca, si no se ha pedido. */
  filtradasRevisadasEn: string | null
}

/* ---------- Importar ---------- */

export type FormatoImportacion =
  | 'chromium'
  | 'firefox'
  | 'bitwarden-csv'
  | 'bitwarden-json'
  | '1password-csv'
  | '1pux'
  | 'keepass'
  | 'lastpass'
  | 'clac'

export interface VistaImportacion {
  formato: FormatoImportacion
  nombreFormato: string
  archivo: string
  total: number
  porCategoria: Partial<Record<CategoriaId, number>>
  /** Los que ya están en la caja fuerte, idénticos: no se vuelven a meter. */
  repetidos: number
  /** Unos pocos, para enseñar antes de importar. */
  muestra: Array<{ titulo: string; subtitulo: string; categoria: CategoriaId }>
  avisos: string[]
}

/* ---------- Varios ---------- */

export interface ResultadoCopia {
  /** Si se vaciará solo, dentro de cuántos segundos. */
  segundos: number
}

export interface InfoDatos {
  carpeta: string
  archivo: string
  copias: number
  ultimaCopia: string | null
  elementos: number
  bovedas: number
}

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AdjuntoInfo,
  Ajustes,
  Boveda,
  BovedaEntrada,
  Elemento,
  ElementoEntrada,
  ElementoLista,
  EstadoElemento,
  EstadoSesion,
  InfoDatos,
  InformeWatchtower,
  ResultadoCopia,
  VersionHistorial,
  VistaImportacion
} from '@shared/tipos'

interface Sobre<T> {
  ok: boolean
  data?: T
  error?: string
}

/** Desempaqueta la respuesta del proceso principal y convierte el fallo en una excepción normal. */
async function llamar<T>(canal: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(canal, ...args)) as Sobre<T>
  if (!r?.ok) throw new Error(r?.error ?? 'Error desconocido')
  return r.data as T
}

/** Escucha un aviso del proceso principal. Devuelve la función que deja de escuchar. */
function escuchar<A extends unknown[]>(canal: string, fn: (...args: A) => void): () => void {
  const envoltorio = (_e: IpcRendererEvent, ...args: unknown[]): void => fn(...(args as A))
  ipcRenderer.on(canal, envoltorio)
  return () => ipcRenderer.removeListener(canal, envoltorio)
}

export interface ParSsh {
  privada: string
  publica: string
  huella: string
  tipo: string
}

const api = {
  sesion: {
    estado: () => llamar<EstadoSesion>('sesion:estado'),
    crear: (contrasena: string) => llamar<string>('sesion:crear', contrasena),
    desbloquear: (contrasena: string, clave?: string) => llamar<void>('sesion:desbloquear', contrasena, clave),
    bloquear: () => llamar<void>('sesion:bloquear'),
    cambiarContrasena: (actual: string, nueva: string) => llamar<void>('sesion:cambiarContrasena', actual, nueva),
    claveSecreta: (contrasena: string) => llamar<string>('sesion:claveSecreta', contrasena),
    kit: (contrasena: string) => llamar<string | null>('sesion:kit', contrasena),
    restaurarElegir: () => llamar<{ ruta: string; nombre: string; idCuenta: string } | null>('sesion:restaurarElegir'),
    restaurar: (ruta: string, contrasena: string, clave: string) => llamar<void>('sesion:restaurar', ruta, contrasena, clave)
  },
  ajustes: {
    leer: () => llamar<Ajustes>('ajustes:leer'),
    guardar: (cambios: Partial<Ajustes>) => llamar<Ajustes>('ajustes:guardar', cambios)
  },
  bovedas: {
    listar: () => llamar<Boveda[]>('bovedas:listar'),
    guardar: (entrada: BovedaEntrada) => llamar<Boveda>('bovedas:guardar', entrada),
    eliminar: (id: string) => llamar<void>('bovedas:eliminar', id)
  },
  elementos: {
    listar: () => llamar<ElementoLista[]>('elementos:listar'),
    obtener: (id: string) => llamar<Elemento>('elementos:obtener', id),
    guardar: (entrada: ElementoEntrada) => llamar<Elemento>('elementos:guardar', entrada),
    estado: (ids: string[], estado: EstadoElemento) => llamar<void>('elementos:estado', ids, estado),
    eliminarDefinitivamente: (ids: string[]) => llamar<number>('elementos:eliminarDefinitivamente', ids),
    vaciarPapelera: () => llamar<number>('elementos:vaciarPapelera'),
    mover: (ids: string[], bovedaId: string) => llamar<void>('elementos:mover', ids, bovedaId),
    duplicar: (id: string) => llamar<Elemento>('elementos:duplicar', id),
    favorito: (id: string) => llamar<ElementoLista>('elementos:favorito', id),
    historial: (id: string) => llamar<VersionHistorial[]>('elementos:historial', id),
    restaurarVersion: (id: string, versionId: string) => llamar<Elemento>('elementos:restaurarVersion', id, versionId)
  },
  adjuntos: {
    anadir: (elementoId: string) => llamar<AdjuntoInfo[]>('adjuntos:anadir', elementoId),
    guardar: (id: string) => llamar<string | null>('adjuntos:guardar', id),
    vistaPrevia: (id: string) => llamar<string | null>('adjuntos:vistaPrevia', id),
    eliminar: (id: string) => llamar<void>('adjuntos:eliminar', id)
  },
  copiar: {
    campo: (elementoId: string, campoId: string) => llamar<ResultadoCopia>('copiar:campo', elementoId, campoId),
    texto: (texto: string) => llamar<ResultadoCopia>('copiar:texto', texto),
    rapido: (elementoId: string, que: 'usuario' | 'contrasena' | 'totp') =>
      llamar<ResultadoCopia>('copiar:rapido', elementoId, que)
  },
  acceso: {
    buscar: (consulta: string) => llamar<ElementoLista[]>('acceso:buscar', consulta),
    ocultar: () => llamar<void>('acceso:ocultar'),
    abrirEnApp: (id: string) => llamar<void>('acceso:abrirEnApp', id),
    abrirPrincipal: () => llamar<void>('acceso:abrirPrincipal')
  },
  watchtower: {
    informe: () => llamar<InformeWatchtower>('watchtower:informe'),
    filtradas: () => llamar<InformeWatchtower>('watchtower:filtradas')
  },
  ssh: {
    generar: (comentario: string) => llamar<ParSsh>('ssh:generar', comentario)
  },
  web: {
    abrir: (texto: string) => llamar<void>('web:abrir', texto)
  },
  app: {
    version: () => llamar<string>('app:version')
  },
  datos: {
    info: () => llamar<InfoDatos>('datos:info'),
    copiaAhora: () => llamar<string>('datos:copiaAhora'),
    abrirCarpeta: () => llamar<string>('datos:abrirCarpeta'),
    guardarCopiaCifrada: () => llamar<string | null>('datos:guardarCopiaCifrada'),
    exportar: (formato: 'json' | 'csv', contrasena: string) => llamar<string | null>('datos:exportar', formato, contrasena)
  },
  importar: {
    elegir: () => llamar<VistaImportacion | null>('importar:elegir'),
    confirmar: (bovedaId: string) => llamar<{ nuevos: number; repetidos: number }>('importar:confirmar', bovedaId),
    cancelar: () => llamar<void>('importar:cancelar')
  },
  en: {
    sesion: (fn: (estado: EstadoSesion) => void) => escuchar('sesion:cambio', fn),
    datos: (fn: () => void) => escuchar('datos:cambio', fn),
    ajustes: (fn: (a: Ajustes) => void) => escuchar('ajustes:cambio', fn),
    menu: (fn: (accion: string) => void) => escuchar('menu', fn),
    abrirElemento: (fn: (id: string) => void) => escuchar('abrir:elemento', fn),
    accesoMostrado: (fn: () => void) => escuchar('acceso:mostrado', fn),
    progresoFiltradas: (fn: (hechas: number, total: number) => void) => escuchar('watchtower:progreso', fn)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('clac', api)

/**
 * El puente: todo lo que la ventana puede pedirle al proceso principal.
 *
 * Cada canal devuelve `{ ok, data }` o `{ ok: false, error }` con un mensaje
 * pensado para enseñarse tal cual. La ventana no toca nunca el disco, ni el
 * cifrado, ni la clave secreta: pide, y aquí se hace.
 */
import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import {
  ajustes,
  avisar,
  bloquear,
  cambiarAjustes,
  carpetaDatos,
  claveDeEsteEquipo,
  crearCaja,
  desbloquear,
  desbloquearConHello,
  estadoHelloSesion,
  estadoSesion,
  exigirContrasena,
  hacerCopiaAhora,
  laCaja,
  restaurarCopia
} from './servicio'
import { copiar } from './portapapeles'
import { comprobarFiltraciones } from './hibp'
import { construirKitHtml } from './kit'
import { ocultarAcceso } from './acceso'
import { carpetaExtension, infoNavegador } from './navegador/conexion'
import { exportarCsv, exportarJson } from './boveda/exportar'
import { leerZip, type EntradaZip } from './boveda/zip'
import { generarClaveSsh } from './boveda/ssh'
import { tipoDeArchivo, CajaFuerte } from './boveda/boveda'
import { contarCopias, copiarA } from './boveda/db'
import { registrar, registrarFallo } from './registro'
import { estadoHello, pedirHello } from './ayudante'
import { motivoHello } from './hello'
import { buscarActualizacion, descargarActualizacion, estadoActualizacion, instalarActualizacion } from './actualizaciones'
import { contrasenaDe, todosLosCampos, usuarioDe, totpDe } from '@shared/categorias'
import { leerTotp, codigoTotp } from '@shared/totp'
import { revisar } from '@shared/watchtower'
import { buscar, sugerencias } from '@shared/buscar'
import { normalizarWeb } from '@shared/webs'
import { desde1pux, leerExportacion, NOMBRES_FORMATO, type Lectura } from '@shared/importar'
import { formatearClave } from '@shared/claveSecreta'
import type {
  Ajustes,
  BovedaEntrada,
  ElementoEntrada,
  EstadoElemento,
  InfoDatos,
  InformeWatchtower,
  VistaImportacion
} from '@shared/tipos'

type Manejador = (...args: never[]) => unknown

function handle(canal: string, fn: Manejador): void {
  ipcMain.handle(canal, async (_evento, ...args: unknown[]) => {
    try {
      return { ok: true, data: await (fn as (...a: unknown[]) => unknown)(...args) }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error)
      // Los errores de uso («la contraseña no es correcta») no son fallos.
      if (!(error instanceof Error) || !['ErrorContrasena', 'ErrorBloqueada'].includes(error.name)) {
        registrarFallo(canal, error)
      }
      return { ok: false, error: mensaje }
    }
  })
}

interface Entorno {
  ventanaPrincipal: () => BrowserWindow | null
  iconoPng: string
  mostrarPrincipal: () => void
  alCambiarAjustes: (a: Ajustes) => void
}

let importacion: { lectura: Lectura; archivo: string; zip: Map<string, EntradaZip> | null } | null = null

function datosCambiados(): void {
  avisar('datos:cambio')
}

function segundosPortapapeles(): number {
  return ajustes().portapapelesSegundos
}

/**
 * Como `handle`, pero el manejador recibe primero la ventana que ha pedido, en
 * el número que entiende Windows: para sacar el diálogo de Hello encima de ella.
 */
function handleConVentana(canal: string, fn: (ventana: bigint, ...args: never[]) => unknown): void {
  ipcMain.handle(canal, async (evento, ...args: unknown[]) => {
    try {
      const w = BrowserWindow.fromWebContents(evento.sender)
      const hwnd = w ? w.getNativeWindowHandle().readBigUInt64LE(0) : 0n
      try {
        return { ok: true, data: await (fn as (...a: unknown[]) => unknown)(hwnd, ...args) }
      } finally {
        // Cerrado el diálogo, el foco vuelve a la ventana que lo pidió.
        if (w && !w.isDestroyed() && w.isVisible()) w.focus()
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

export function registrarIpc(entorno: Entorno): void {
  const ventana = (): BrowserWindow => {
    const w = entorno.ventanaPrincipal()
    if (!w) throw new Error('No hay ventana abierta.')
    return w
  }

  /* ---------- Sesión ---------- */

  handle('sesion:estado', () => estadoSesion())
  handle('sesion:crear', (contrasena: string) => crearCaja(contrasena))
  handle('sesion:desbloquear', (contrasena: string, clave?: string) => desbloquear(contrasena, clave))
  handle('sesion:bloquear', () => bloquear('a mano'))
  handle('sesion:hello', () => estadoHelloSesion())
  handleConVentana('sesion:desbloquearHello', (ventana: bigint) => desbloquearConHello(ventana))

  /* ---------- Windows Hello ---------- */

  handle('hello:disponible', () => estadoHello())
  // Encenderlo pide confirmar una vez: así se sabe que funciona antes de fiarse de él.
  handleConVentana('hello:activar', async (ventana: bigint) => {
    const r = await pedirHello('Usar Windows Hello para desbloquear CLAC', ventana)
    if (r !== 'Verified') throw new Error(motivoHello(r))
    const nuevos = cambiarAjustes({ windowsHello: true })
    entorno.alCambiarAjustes(nuevos)
    registrar('sesión', 'Windows Hello activado')
    return nuevos
  })
  handle('sesion:cambiarContrasena', (actual: string, nueva: string) => {
    const clave = claveDeEsteEquipo()
    laCaja().cambiarContrasena(actual, nueva, clave.secreto)
    registrar('sesión', 'contraseña maestra cambiada')
  })
  handle('sesion:claveSecreta', (contrasena: string) => formatearClave(exigirContrasena(contrasena)))

  handle('sesion:kit', async (contrasena: string) => {
    const clave = exigirContrasena(contrasena)
    const cuenta = laCaja().idCuenta()
    const r = await dialog.showSaveDialog(ventana(), {
      title: 'Guardar el kit de emergencia',
      defaultPath: join(app.getPath('documents'), `Kit de emergencia de CLAC (${cuenta}).pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (r.canceled || !r.filePath) return null
    const html = construirKitHtml({ clave, carpeta: carpetaDatos(), creada: new Date(), icono: entorno.iconoPng })
    // Desde una ventana oculta, como el informe de BONK: la página la pagina el propio motor.
    const impresora = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    })
    try {
      await impresora.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pdf = await impresora.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      })
      writeFileSync(r.filePath, pdf)
    } finally {
      impresora.destroy()
    }
    return r.filePath
  })

  handle('sesion:restaurarElegir', async () => {
    const r = await dialog.showOpenDialog(ventana(), {
      title: 'Elegir una copia de CLAC',
      properties: ['openFile'],
      filters: [{ name: 'Caja fuerte de CLAC', extensions: ['db', 'clac'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const ruta = r.filePaths[0]
    return { ruta, nombre: basename(ruta), idCuenta: CajaFuerte.examinar(ruta).idCuenta }
  })
  handle('sesion:restaurar', (ruta: string, contrasena: string, clave: string) => {
    restaurarCopia(ruta, contrasena, clave)
    entorno.alCambiarAjustes(ajustes())
  })

  /* ---------- Actualizaciones ---------- */

  handle('actualizacion:estado', () => estadoActualizacion())
  handle('actualizacion:buscar', () => buscarActualizacion())
  handle('actualizacion:descargar', () => descargarActualizacion())
  handle('actualizacion:instalar', () => instalarActualizacion())

  /* ---------- Ajustes ---------- */

  handle('ajustes:leer', () => ajustes())
  handle('ajustes:guardar', (cambios: Partial<Ajustes>) => {
    const nuevos = cambiarAjustes(cambios)
    entorno.alCambiarAjustes(nuevos)
    return nuevos
  })

  /* ---------- Cajas fuertes ---------- */

  handle('bovedas:listar', () => laCaja().bovedas())
  handle('bovedas:guardar', (entrada: BovedaEntrada) => {
    const b = laCaja().guardarBoveda(entrada)
    datosCambiados()
    return b
  })
  handle('bovedas:eliminar', (id: string) => {
    laCaja().eliminarBoveda(id)
    datosCambiados()
  })

  /* ---------- Elementos ---------- */

  handle('elementos:listar', () => laCaja().listar())
  handle('elementos:obtener', (id: string) => laCaja().obtener(id))
  handle('elementos:guardar', (entrada: ElementoEntrada) => {
    const e = laCaja().guardar(entrada)
    datosCambiados()
    return e
  })
  handle('elementos:estado', (ids: string[], estado: EstadoElemento) => {
    laCaja().cambiarEstado(ids, estado)
    datosCambiados()
  })
  handle('elementos:eliminarDefinitivamente', (ids: string[]) => {
    const n = laCaja().eliminarDefinitivamente(ids)
    datosCambiados()
    return n
  })
  handle('elementos:vaciarPapelera', () => {
    const n = laCaja().vaciarPapelera()
    datosCambiados()
    return n
  })
  handle('elementos:mover', (ids: string[], bovedaId: string) => {
    laCaja().mover(ids, bovedaId)
    datosCambiados()
  })
  handle('elementos:duplicar', (id: string) => {
    const e = laCaja().duplicar(id)
    datosCambiados()
    return e
  })
  handle('elementos:historial', (id: string) => laCaja().historial(id))
  handle('elementos:restaurarVersion', (id: string, versionId: string) => {
    const e = laCaja().restaurarVersion(id, versionId)
    datosCambiados()
    return e
  })

  /* ---------- Adjuntos ---------- */

  handle('adjuntos:anadir', async (elementoId: string) => {
    const r = await dialog.showOpenDialog(ventana(), {
      title: 'Adjuntar archivos',
      buttonLabel: 'Adjuntar',
      properties: ['openFile', 'multiSelections']
    })
    if (r.canceled) return []
    const hechos = r.filePaths.map((ruta) => laCaja().anadirAdjunto(elementoId, basename(ruta), tipoDeArchivo(ruta), readFileSync(ruta)))
    datosCambiados()
    return hechos
  })
  handle('adjuntos:guardar', async (id: string) => {
    const { info, datos } = laCaja().leerAdjunto(id)
    const r = await dialog.showSaveDialog(ventana(), {
      title: 'Guardar una copia del archivo',
      defaultPath: join(app.getPath('downloads'), info.nombre),
      filters: [{ name: `*${extname(info.nombre)}`, extensions: [extname(info.nombre).slice(1) || '*'] }]
    })
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, datos)
    return r.filePath
  })
  handle('adjuntos:vistaPrevia', (id: string) => {
    // Solo imágenes, que se enseñan dentro sin escribir nada en el disco.
    const { info, datos } = laCaja().leerAdjunto(id)
    if (!info.tipo.startsWith('image/')) return null
    return `data:${info.tipo};base64,${datos.toString('base64')}`
  })
  handle('adjuntos:eliminar', (id: string) => {
    laCaja().eliminarAdjunto(id)
    datosCambiados()
  })

  /* ---------- Portapapeles ---------- */

  handle('copiar:campo', async (elementoId: string, campoId: string) => {
    const e = laCaja().obtener(elementoId)
    const campo = todosLosCampos(e).find((c) => c.id === campoId)
    if (!campo) throw new Error('Ese campo ya no existe.')
    let texto = campo.valor
    if (campo.tipo === 'totp') {
      const cfg = leerTotp(campo.valor)
      if (!cfg) throw new Error('El código de un solo uso no tiene un secreto válido.')
      texto = await codigoTotp(cfg)
    }
    laCaja().anotarUso(elementoId)
    return copiar(texto, segundosPortapapeles())
  })
  handle('copiar:texto', (texto: string) => copiar(texto, segundosPortapapeles()))
  handle('copiar:rapido', async (elementoId: string, que: 'usuario' | 'contrasena' | 'totp') => {
    const e = laCaja().obtener(elementoId)
    let texto = que === 'usuario' ? usuarioDe(e) : que === 'contrasena' ? contrasenaDe(e) : ''
    if (que === 'totp') {
      const cfg = leerTotp(totpDe(e))
      if (!cfg) throw new Error('Este elemento no tiene código de un solo uso.')
      texto = await codigoTotp(cfg)
    }
    if (!texto) throw new Error(que === 'usuario' ? 'Este elemento no tiene usuario.' : 'Este elemento no tiene contraseña.')
    laCaja().anotarUso(elementoId)
    datosCambiados()
    return copiar(texto, segundosPortapapeles())
  })

  /* ---------- Acceso rápido ---------- */

  handle('acceso:buscar', (consulta: string) => {
    const activos = laCaja()
      .listar()
      .filter((e) => e.estado === 'activo')
    return consulta.trim() ? buscar(activos, consulta).slice(0, 30) : sugerencias(activos, 12)
  })
  handle('acceso:ocultar', () => ocultarAcceso())
  handle('acceso:abrirEnApp', (id: string) => {
    ocultarAcceso()
    entorno.mostrarPrincipal()
    entorno.ventanaPrincipal()?.webContents.send('abrir:elemento', id)
  })
  handle('acceso:abrirPrincipal', () => {
    ocultarAcceso()
    entorno.mostrarPrincipal()
  })

  /* ---------- Watchtower ---------- */

  const informe = (): InformeWatchtower => {
    const c = laCaja()
    const datos = c.datosCuenta()
    return revisar(c.todosConDetalle(), datos.filtraciones, datos.filtradasRevisadasEn)
  }
  handle('watchtower:informe', () => informe())
  handle('watchtower:filtradas', async () => {
    const c = laCaja()
    registrar('watchtower', 'consultando filtraciones')
    const filtraciones = await comprobarFiltraciones(c.todosConDetalle(), (hechas, total) =>
      avisar('watchtower:progreso', hechas, total)
    )
    c.guardarDatosCuenta({ filtraciones, filtradasRevisadasEn: new Date().toISOString() })
    return informe()
  })

  /* ---------- Navegador ---------- */

  handle('navegador:info', () => infoNavegador(ajustes().navegador))
  handle('navegador:abrirCarpeta', () => shell.openPath(carpetaExtension()))

  /* ---------- Varios ---------- */

  handle('ssh:generar', (comentario: string) => generarClaveSsh(comentario || 'clac'))

  handle('web:abrir', (texto: string) => {
    const url = normalizarWeb(texto)
    if (!url) throw new Error('No es una dirección web que se pueda abrir.')
    void shell.openExternal(url)
  })

  handle('app:version', () => app.getVersion())

  /* ---------- Datos ---------- */

  handle('datos:info', (): InfoDatos => {
    const c = laCaja()
    return {
      carpeta: carpetaDatos(),
      archivo: join(carpetaDatos(), 'clac.db'),
      copias: contarCopias(carpetaDatos()),
      ultimaCopia: ajustes().ultimaCopia,
      elementos: c.abierta() ? c.listar().filter((e) => e.estado !== 'eliminado').length : 0,
      bovedas: c.abierta() ? c.bovedas().length : 0
    }
  })
  handle('datos:copiaAhora', () => hacerCopiaAhora())
  handle('datos:abrirCarpeta', () => shell.openPath(carpetaDatos()))
  handle('datos:guardarCopiaCifrada', async () => {
    const sello = new Date().toISOString().slice(0, 10)
    const r = await dialog.showSaveDialog(ventana(), {
      title: 'Guardar una copia cifrada',
      defaultPath: join(app.getPath('documents'), `CLAC ${sello}.db`),
      filters: [{ name: 'Caja fuerte de CLAC', extensions: ['db'] }]
    })
    if (r.canceled || !r.filePath) return null
    copiarA(laCaja().db, r.filePath)
    return r.filePath
  })

  handle('datos:exportar', async (formato: 'json' | 'csv', contrasena: string) => {
    exigirContrasena(contrasena)
    const sello = new Date().toISOString().slice(0, 10)
    const r = await dialog.showSaveDialog(ventana(), {
      title: 'Exportar sin cifrar',
      defaultPath: join(app.getPath('documents'), `CLAC sin cifrar ${sello}.${formato}`),
      filters: [formato === 'json' ? { name: 'JSON', extensions: ['json'] } : { name: 'CSV', extensions: ['csv'] }]
    })
    if (r.canceled || !r.filePath) return null
    const c = laCaja()
    const texto = formato === 'json' ? exportarJson(c.todosConDetalle(), c.bovedas()) : exportarCsv(c.todosConDetalle(), c.bovedas())
    // Con marca de orden de bytes: Excel abre así el CSV con sus tildes bien.
    writeFileSync(r.filePath, (formato === 'csv' ? '﻿' : '') + texto, 'utf8')
    registrar('datos', `exportado en ${formato}`)
    return r.filePath
  })

  handle('importar:elegir', async (): Promise<VistaImportacion | null> => {
    const r = await dialog.showOpenDialog(ventana(), {
      title: 'Importar contraseñas',
      properties: ['openFile'],
      filters: [
        { name: 'Exportaciones de contraseñas', extensions: ['csv', 'json', '1pux'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const ruta = r.filePaths[0]
    let lectura: Lectura
    let zip: Map<string, EntradaZip> | null = null
    if (extname(ruta).toLowerCase() === '.1pux') {
      zip = leerZip(readFileSync(ruta))
      const datos = zip.get('export.data')
      if (!datos) throw new Error('El .1pux no trae «export.data»: puede que esté incompleto.')
      lectura = desde1pux(JSON.parse(datos.leer().toString('utf8')))
    } else {
      lectura = leerExportacion(readFileSync(ruta, 'utf8'))
    }
    if (!lectura.elementos.length) throw new Error('El archivo no trae ningún elemento que importar.')
    importacion = { lectura, archivo: basename(ruta), zip }
    const porCategoria: VistaImportacion['porCategoria'] = {}
    for (const e of lectura.elementos) porCategoria[e.categoria] = (porCategoria[e.categoria] ?? 0) + 1
    return {
      formato: lectura.formato,
      nombreFormato: NOMBRES_FORMATO[lectura.formato],
      archivo: basename(ruta),
      total: lectura.elementos.length,
      porCategoria,
      repetidos: laCaja().contarRepetidos(lectura.elementos),
      muestra: lectura.elementos.slice(0, 6).map((e) => ({
        titulo: e.titulo,
        subtitulo: usuarioDe(e),
        categoria: e.categoria
      })),
      avisos: lectura.avisos
    }
  })
  handle('importar:confirmar', (bovedaId: string) => {
    if (!importacion) throw new Error('No hay nada que importar.')
    const { lectura, zip } = importacion
    const r = laCaja().importar(lectura.elementos, bovedaId, (ruta) => zip?.get(ruta)?.leer() ?? null)
    importacion = null
    registrar('datos', `importados ${r.nuevos} (${r.repetidos} repetidos)`)
    datosCambiados()
    return r
  })
  handle('importar:cancelar', () => {
    importacion = null
  })
}

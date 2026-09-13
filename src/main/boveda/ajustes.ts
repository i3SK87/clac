/**
 * Los ajustes de la aplicación, en claro dentro del mismo archivo.
 *
 * Van sin cifrar a propósito: el tema y la paleta hacen falta para pintar la
 * pantalla de desbloqueo, y los minutos del bloqueo, para bloquear. Ninguno
 * dice nada de lo que hay dentro de la caja.
 */
import type { DatabaseSync } from 'node:sqlite'
import { esPaleta } from 'casa/paletas'
import type { Ajustes } from '@shared/tipos'

export const AJUSTES_DE_FABRICA: Ajustes = {
  theme: 'system',
  palette: 'grafito',
  bloqueoMinutos: 10,
  bloquearAlSuspender: true,
  bloquearAlBloquearWindows: true,
  portapapelesSegundos: 90,
  accesoRapido: true,
  arrancarConWindows: false,
  cerrarABandeja: true,
  ordenLista: 'titulo',
  ultimaCopia: null
}

export function leerAjustes(db: DatabaseSync): Ajustes {
  const filas = db.prepare('SELECT clave, valor FROM ajustes').all() as unknown as Array<{ clave: string; valor: string }>
  const guardados: Record<string, unknown> = {}
  for (const f of filas) {
    try {
      guardados[f.clave] = JSON.parse(f.valor)
    } catch {
      // Un ajuste ilegible vuelve al de fábrica sin llevarse los demás.
    }
  }
  return sanear({ ...AJUSTES_DE_FABRICA, ...guardados } as Ajustes)
}

export function guardarAjustes(db: DatabaseSync, cambios: Partial<Ajustes>): Ajustes {
  const limpio = sanear({ ...leerAjustes(db), ...cambios })
  const poner = db.prepare(
    'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
  )
  for (const clave of Object.keys(cambios) as Array<keyof Ajustes>) {
    if (clave in AJUSTES_DE_FABRICA) poner.run(clave, JSON.stringify(limpio[clave]))
  }
  return limpio
}

function entre(valor: unknown, min: number, max: number, porDefecto: number): number {
  const n = Number(valor)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : porDefecto
}

function sanear(a: Ajustes): Ajustes {
  const f = AJUSTES_DE_FABRICA
  return {
    theme: a.theme === 'light' || a.theme === 'dark' ? a.theme : 'system',
    palette: esPaleta(a.palette) ? a.palette : f.palette,
    bloqueoMinutos: entre(a.bloqueoMinutos, 0, 240, f.bloqueoMinutos),
    bloquearAlSuspender: a.bloquearAlSuspender !== false,
    bloquearAlBloquearWindows: a.bloquearAlBloquearWindows !== false,
    portapapelesSegundos: entre(a.portapapelesSegundos, 0, 600, f.portapapelesSegundos),
    accesoRapido: a.accesoRapido !== false,
    arrancarConWindows: a.arrancarConWindows === true,
    cerrarABandeja: a.cerrarABandeja !== false,
    ordenLista: a.ordenLista === 'modificado' || a.ordenLista === 'usado' ? a.ordenLista : 'titulo',
    ultimaCopia: typeof a.ultimaCopia === 'string' ? a.ultimaCopia : null
  }
}

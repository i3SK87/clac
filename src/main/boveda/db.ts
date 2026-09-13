/**
 * El archivo de la caja fuerte: un SQLite con casi todo cifrado dentro.
 *
 * Lo que va en claro es lo mínimo para funcionar: los parámetros para derivar
 * la clave, las fechas de cada elemento, en qué estado está (activo, archivado,
 * en la papelera) y cuántas veces se ha usado. Los títulos, las webs, los
 * usuarios, las contraseñas, las notas, los nombres de las cajas fuertes y los
 * adjuntos van cifrados. Los ajustes de la aplicación —el tema, los minutos
 * del bloqueo— también van en claro, porque hacen falta antes de desbloquear.
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const MIGRACIONES: string[] = [
  `
  CREATE TABLE meta (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  CREATE TABLE ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  CREATE TABLE bovedas (
    id TEXT PRIMARY KEY,
    clave BLOB NOT NULL,
    datos BLOB NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    creada TEXT NOT NULL
  );
  CREATE TABLE elementos (
    id TEXT PRIMARY KEY,
    boveda_id TEXT NOT NULL REFERENCES bovedas(id),
    estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'archivado', 'eliminado')),
    resumen BLOB NOT NULL,
    detalle BLOB NOT NULL,
    creado TEXT NOT NULL,
    modificado TEXT NOT NULL,
    eliminado TEXT,
    usado TEXT,
    usos INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX elementos_boveda ON elementos(boveda_id);
  CREATE TABLE historial (
    id TEXT PRIMARY KEY,
    elemento_id TEXT NOT NULL REFERENCES elementos(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    datos BLOB NOT NULL
  );
  CREATE INDEX historial_elemento ON historial(elemento_id, fecha);
  CREATE TABLE adjuntos (
    id TEXT PRIMARY KEY,
    elemento_id TEXT NOT NULL REFERENCES elementos(id) ON DELETE CASCADE,
    meta BLOB NOT NULL,
    datos BLOB NOT NULL,
    creado TEXT NOT NULL
  );
  CREATE INDEX adjuntos_elemento ON adjuntos(elemento_id);
  `
]

export const NOMBRE_ARCHIVO = 'clac.db'

export function abrirArchivo(ruta: string): DatabaseSync {
  const db = new DatabaseSync(ruta)
  // WAL aguanta mucho mejor un apagón o un cierre de Windows a lo bruto.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = FULL')
  db.exec('PRAGMA foreign_keys = ON')
  migrar(db)
  return db
}

function migrar(db: DatabaseSync): void {
  const fila = db.prepare('PRAGMA user_version').get() as unknown as { user_version: number }
  const actual = Number(fila?.user_version ?? 0)
  for (let version = actual; version < MIGRACIONES.length; version++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRACIONES[version])
      db.exec(`PRAGMA user_version = ${version + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`Falló la migración ${version + 1}: ${(error as Error).message}`)
    }
  }
}

const profundidad = new WeakMap<DatabaseSync, number>()

/**
 * Varias escrituras como una sola: o entran todas o ninguna.
 *
 * Admite anidarse, como la de BONK: importar mete elementos y a cada uno le
 * puede cambiar el estado, y las dos cosas son atómicas por su cuenta. SQLite
 * no deja abrir un BEGIN dentro de otro, así que por dentro van puntos de
 * guardado.
 */
export function transaccion<T>(db: DatabaseSync, fn: () => T): T {
  const nivel = profundidad.get(db) ?? 0
  if (nivel > 0) {
    const punto = `clac_${nivel}`
    db.exec(`SAVEPOINT ${punto}`)
    profundidad.set(db, nivel + 1)
    try {
      const r = fn()
      db.exec(`RELEASE ${punto}`)
      return r
    } catch (error) {
      db.exec(`ROLLBACK TO ${punto}`)
      db.exec(`RELEASE ${punto}`)
      throw error
    } finally {
      profundidad.set(db, nivel)
    }
  }
  db.exec('BEGIN IMMEDIATE')
  profundidad.set(db, 1)
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    profundidad.set(db, 0)
  }
}

/**
 * Copia de seguridad en la carpeta `copias`, rotando las viejas.
 *
 * La copia es el archivo tal cual, que ya va cifrado: sirve para volver atrás
 * o para llevársela a otro equipo, pero sin la contraseña y la clave secreta no
 * se abre. Se hace con `VACUUM INTO`, que escribe una copia completa y coherente
 * aunque haya escrituras a medias en el WAL.
 */
export function hacerCopia(db: DatabaseSync, carpetaDatos: string, conservar = 10): string {
  return copiarEnCarpeta(db, join(carpetaDatos, 'copias'), conservar)
}

/**
 * Una copia fechada en una carpeta, dejando solo las `conservar` últimas. Es la
 * de cada día en `copias` y, si se ha elegido, en otra carpeta (OneDrive).
 * Solo toca los archivos `clac-*.db`: lo demás que haya en la carpeta es suyo.
 */
export function copiarEnCarpeta(db: DatabaseSync, dir: string, conservar = 10): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const destino = join(dir, `clac-${sello}.db`)
  if (existsSync(destino)) unlinkSync(destino)
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`)

  const viejas = readdirSync(dir)
    .filter((f) => /^clac-.*\.db$/.test(f))
    .sort()
  while (viejas.length > conservar) {
    const victima = viejas.shift()
    if (victima) unlinkSync(join(dir, victima))
  }
  return destino
}

export function contarCopias(carpetaDatos: string): number {
  const dir = join(carpetaDatos, 'copias')
  if (!existsSync(dir)) return 0
  return readdirSync(dir).filter((f) => /^clac-.*\.db$/.test(f)).length
}

/** Una copia exacta en otro sitio, para «Guardar una copia cifrada». */
export function copiarA(db: DatabaseSync, destino: string): void {
  if (existsSync(destino)) unlinkSync(destino)
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`)
}

import Database from 'better-sqlite3'
import schemaSql from './schema.sql?raw'

export type DB = Database.Database

/**
 * Abre (o crea) el archivo SQLite en `rutaArchivo` y aplica el esquema.
 * Solo debe usarse desde el proceso principal de Electron — el renderer
 * accede a datos vía IPC, nunca directamente a better-sqlite3.
 */
export function abrirDb(rutaArchivo: string): DB {
  const db = new Database(rutaArchivo)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schemaSql)
  return db
}

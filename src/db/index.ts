import Database from 'better-sqlite3'
import schemaSql from './schema.sql?raw'
import { migrarColumnasFaltantes } from './migraciones'

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
  // Antes del schema: agrega columnas nuevas a tablas que ya existían en
  // instalaciones previas (schema.sql con CREATE TABLE IF NOT EXISTS no
  // las agrega solo). schema.sql de aquí en adelante crea tablas nuevas e
  // índices que pueden depender de esas columnas.
  migrarColumnasFaltantes(db)
  db.exec(schemaSql)
  return db
}

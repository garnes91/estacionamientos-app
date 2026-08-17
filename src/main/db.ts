import { app } from 'electron'
import { join } from 'path'
import { abrirDb, DB } from '../db'
import { sembrarSiVacio } from '../db/seed'

let db: DB | null = null

/** Abre la base de datos real de esta instalación (una por estacionamiento). */
export function obtenerDb(): DB {
  if (!db) {
    const ruta = join(app.getPath('userData'), 'estacionamientos.db')
    db = abrirDb(ruta)
    sembrarSiVacio(db)
  }
  return db
}

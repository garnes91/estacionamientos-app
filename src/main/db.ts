import { app } from 'electron'
import { join } from 'path'
import { abrirDb, DB } from '../db'
import { sembrarSiVacio } from '../db/seed'

let db: DB | null = null

/** Ruta del archivo .db real de esta instalación — la misma que usa obtenerDb(). */
export function rutaBaseDeDatos(): string {
  return join(app.getPath('userData'), 'estacionamientos.db')
}

/** Abre la base de datos real de esta instalación (una por estacionamiento). */
export function obtenerDb(): DB {
  if (!db) {
    db = abrirDb(rutaBaseDeDatos())
    sembrarSiVacio(db)
  }
  return db
}

/** Cierra la conexión ordenadamente al salir — hace el checkpoint del WAL en vez de dejarlo a medias. */
export function cerrarDb(): void {
  db?.close()
  db = null
}

import type { DB } from './index'

export interface Estacionamiento {
  id: number
  nombre: string
  textoBoleto: string | null
}

/** Cada instalación administra un solo estacionamiento: el primero activo. */
export function obtenerEstacionamientoActual(db: DB): Estacionamiento {
  const fila = db
    .prepare('SELECT id, nombre, texto_boleto AS textoBoleto FROM estacionamientos WHERE activo = 1 ORDER BY id LIMIT 1')
    .get() as Estacionamiento | undefined

  if (!fila) {
    throw new Error('No hay un estacionamiento configurado en esta instalación')
  }

  return fila
}

export function actualizarTextoBoleto(db: DB, estacionamientoId: number, texto: string | null): void {
  db.prepare('UPDATE estacionamientos SET texto_boleto = ? WHERE id = ?').run(texto, estacionamientoId)
}

/**
 * Nombre del estacionamiento — aparece en la pantalla de operación, el
 * boleto impreso, y el corte de caja (pantalla, PDF y Excel). Con varias
 * instalaciones, es lo que distingue de cuál estacionamiento es cada
 * reporte que llega por correo.
 */
export function actualizarNombreEstacionamiento(db: DB, estacionamientoId: number, nombre: string): void {
  const limpio = nombre.trim()
  if (!limpio) {
    throw new Error('El nombre del estacionamiento no puede quedar vacío')
  }
  db.prepare('UPDATE estacionamientos SET nombre = ? WHERE id = ?').run(limpio, estacionamientoId)
}

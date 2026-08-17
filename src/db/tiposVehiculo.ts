import type { DB } from './index'

export interface TipoVehiculo {
  id: number
  nombre: string
}

export function listarTiposVehiculo(db: DB, estacionamientoId: number): TipoVehiculo[] {
  return db
    .prepare<[number], TipoVehiculo>(
      'SELECT id, nombre FROM tipos_vehiculo WHERE estacionamiento_id = ? AND activo = 1 ORDER BY orden'
    )
    .all(estacionamientoId)
}

export interface TipoVehiculoAdmin {
  id: number
  nombre: string
  orden: number
  activo: boolean
}

interface TipoVehiculoRow {
  id: number
  nombre: string
  orden: number
  activo: number
}

/** Incluye inactivos, para la pantalla de configuración. */
export function listarTiposVehiculoAdmin(db: DB, estacionamientoId: number): TipoVehiculoAdmin[] {
  const filas = db
    .prepare<[number], TipoVehiculoRow>(
      'SELECT id, nombre, orden, activo FROM tipos_vehiculo WHERE estacionamiento_id = ? ORDER BY orden'
    )
    .all(estacionamientoId)
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, orden: f.orden, activo: f.activo === 1 }))
}

export interface NuevoTipoVehiculoInput {
  estacionamientoId: number
  nombre: string
}

/**
 * Crea un tipo de vehículo sin tarifa progresiva: el admin debe configurarla
 * aparte. Un tipo sin tarifa vigente no puede emitir boletos (ver emitirBoleto).
 */
export function crearTipoVehiculo(db: DB, input: NuevoTipoVehiculoInput): TipoVehiculoAdmin {
  const { max } = db
    .prepare('SELECT COALESCE(MAX(orden), -1) AS max FROM tipos_vehiculo WHERE estacionamiento_id = ?')
    .get(input.estacionamientoId) as { max: number }

  const orden = max + 1
  const id = db
    .prepare('INSERT INTO tipos_vehiculo (estacionamiento_id, nombre, orden) VALUES (?,?,?)')
    .run(input.estacionamientoId, input.nombre, orden).lastInsertRowid as number

  return { id, nombre: input.nombre, orden, activo: true }
}

export interface ActualizarTipoVehiculoInput {
  id: number
  nombre: string
  activo: boolean
}

export function actualizarTipoVehiculo(db: DB, input: ActualizarTipoVehiculoInput): void {
  db.prepare('UPDATE tipos_vehiculo SET nombre = ?, activo = ? WHERE id = ?').run(
    input.nombre,
    input.activo ? 1 : 0,
    input.id
  )
}

/** ordenIds: ids en el orden deseado — determina el mapeo F1/F2/F3 al emitir. */
export function reordenarTiposVehiculo(db: DB, estacionamientoId: number, ordenIds: number[]): void {
  const actualizar = db.prepare('UPDATE tipos_vehiculo SET orden = ? WHERE id = ? AND estacionamiento_id = ?')
  const transaccion = db.transaction(() => {
    ordenIds.forEach((id, index) => actualizar.run(index, id, estacionamientoId))
  })
  transaccion()
}

/**
 * A diferencia de las series (donde boletos.serie es solo texto), los
 * boletos sí referencian tipos_vehiculo por llave foránea — si ya tiene
 * boletos o tarifas asociadas, SQLite rechaza el DELETE solo. Se atrapa ese
 * caso y se da un mensaje claro en vez de dejar pasar el error crudo;
 * "desactivar" (activo = false) sigue siendo la opción para esos casos.
 */
export function eliminarTipoVehiculo(db: DB, id: number): void {
  try {
    db.prepare('DELETE FROM tipos_vehiculo WHERE id = ?').run(id)
  } catch (error) {
    if (error instanceof Error && error.message.includes('FOREIGN KEY constraint failed')) {
      throw new Error(
        'No se puede eliminar: este tipo de vehículo ya tiene boletos o tarifas asociadas. Desactívalo en su lugar.'
      )
    }
    throw error
  }
}

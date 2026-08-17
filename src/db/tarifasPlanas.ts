import type { DB } from './index'

export interface TarifaPlanaAdmin {
  id: number
  tipoVehiculoId: number
  nombre: string
  precioFijo: number
  horasIncluidas: number
  activo: boolean
}

interface TarifaPlanaRow {
  id: number
  tipoVehiculoId: number
  nombre: string
  precioFijo: number
  horasIncluidas: number
  activo: number
}

/** Solo tarifas vigentes (vigente_hasta IS NULL) — las cerradas por cambiarPrecioTarifaPlana quedan de histórico. */
export function listarTarifasPlanas(db: DB, estacionamientoId: number): TarifaPlanaAdmin[] {
  const filas = db
    .prepare<[number], TarifaPlanaRow>(
      `SELECT id, tipo_vehiculo_id AS tipoVehiculoId, nombre, precio_fijo AS precioFijo,
              horas_incluidas AS horasIncluidas, activo
       FROM tarifas_planas WHERE estacionamiento_id = ? AND vigente_hasta IS NULL ORDER BY id`
    )
    .all(estacionamientoId)

  return filas.map((f) => ({ ...f, activo: f.activo === 1 }))
}

export interface NuevaTarifaPlanaInput {
  estacionamientoId: number
  tipoVehiculoId: number
  nombre: string
  precioFijo: number
  horasIncluidas: number
}

export function crearTarifaPlana(db: DB, input: NuevaTarifaPlanaInput): TarifaPlanaAdmin {
  const ahora = new Date().toISOString()
  const id = db
    .prepare(
      `INSERT INTO tarifas_planas (estacionamiento_id, tipo_vehiculo_id, nombre, precio_fijo, horas_incluidas, vigente_desde)
       VALUES (?,?,?,?,?,?)`
    )
    .run(input.estacionamientoId, input.tipoVehiculoId, input.nombre, input.precioFijo, input.horasIncluidas, ahora)
    .lastInsertRowid as number

  return {
    id,
    tipoVehiculoId: input.tipoVehiculoId,
    nombre: input.nombre,
    precioFijo: input.precioFijo,
    horasIncluidas: input.horasIncluidas,
    activo: true
  }
}

export interface ActualizarTarifaPlanaInput {
  id: number
  nombre: string
  activo: boolean
}

/** Solo renombra / activa-desactiva in place: no afecta boletos ya emitidos con esta tarifa. */
export function actualizarTarifaPlana(db: DB, input: ActualizarTarifaPlanaInput): void {
  db.prepare('UPDATE tarifas_planas SET nombre = ?, activo = ? WHERE id = ?').run(
    input.nombre,
    input.activo ? 1 : 0,
    input.id
  )
}

export interface CambiarPrecioTarifaPlanaInput {
  id: number
  estacionamientoId: number
  tipoVehiculoId: number
  nombre: string
  precioFijo: number
  horasIncluidas: number
}

/**
 * Cambiar precio/horas incluidas crea una versión nueva y cierra la
 * anterior (vigente_hasta), igual que actualizarTarifaProgresiva — así los
 * boletos abiertos que ya quedaron atados a la tarifa vieja no se alteran.
 */
export function cambiarPrecioTarifaPlana(db: DB, input: CambiarPrecioTarifaPlanaInput): TarifaPlanaAdmin {
  const transaccion = db.transaction((): TarifaPlanaAdmin => {
    const ahora = new Date().toISOString()
    db.prepare('UPDATE tarifas_planas SET vigente_hasta = ? WHERE id = ?').run(ahora, input.id)
    return crearTarifaPlana(db, {
      estacionamientoId: input.estacionamientoId,
      tipoVehiculoId: input.tipoVehiculoId,
      nombre: input.nombre,
      precioFijo: input.precioFijo,
      horasIncluidas: input.horasIncluidas
    })
  })

  return transaccion()
}

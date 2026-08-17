import type { DB } from './index'
import { BLOQUES_CONFIGURABLES, TarifaPlana, TarifaProgresiva } from '../logic/motorTarifas'

export function obtenerTarifaProgresiva(db: DB, tarifaProgresivaId: number): TarifaProgresiva {
  const cabecera = db
    .prepare<[number], { tarifa_maxima_diaria: number }>(
      'SELECT tarifa_maxima_diaria FROM tarifas_progresivas WHERE id = ?'
    )
    .get(tarifaProgresivaId)

  if (!cabecera) {
    throw new Error(`No existe la tarifa progresiva ${tarifaProgresivaId}`)
  }

  const bloques = db
    .prepare<[number], { numero_bloque: number; precio: number }>(
      'SELECT numero_bloque, precio FROM tarifas_progresivas_bloques WHERE tarifa_progresiva_id = ? ORDER BY numero_bloque'
    )
    .all(tarifaProgresivaId)

  if (bloques.length !== BLOQUES_CONFIGURABLES) {
    throw new Error(
      `La tarifa progresiva ${tarifaProgresivaId} tiene ${bloques.length} bloques configurados, se esperaban ${BLOQUES_CONFIGURABLES}`
    )
  }

  return {
    preciosPorBloque: bloques.map((b) => b.precio),
    tarifaMaximaDiaria: cabecera.tarifa_maxima_diaria
  }
}

export function obtenerTarifaPlana(db: DB, tarifaPlanaId: number): TarifaPlana {
  const fila = db
    .prepare<[number], { precio_fijo: number; horas_incluidas: number }>(
      'SELECT precio_fijo, horas_incluidas FROM tarifas_planas WHERE id = ?'
    )
    .get(tarifaPlanaId)

  if (!fila) {
    throw new Error(`No existe la tarifa plana ${tarifaPlanaId}`)
  }

  return { precioFijo: fila.precio_fijo, horasIncluidas: fila.horas_incluidas }
}

export interface TarifaProgresivaAdmin {
  id: number
  tarifaMaximaDiaria: number
  preciosPorBloque: number[]
}

export function obtenerTarifaProgresivaActivaPorTipo(db: DB, tipoVehiculoId: number): TarifaProgresivaAdmin | null {
  const cabecera = db
    .prepare<[number], { id: number; tarifa_maxima_diaria: number }>(
      'SELECT id, tarifa_maxima_diaria FROM tarifas_progresivas WHERE tipo_vehiculo_id = ? AND vigente_hasta IS NULL'
    )
    .get(tipoVehiculoId)

  if (!cabecera) return null

  const bloques = db
    .prepare<[number], { precio: number }>(
      'SELECT precio FROM tarifas_progresivas_bloques WHERE tarifa_progresiva_id = ? ORDER BY numero_bloque'
    )
    .all(cabecera.id)

  return {
    id: cabecera.id,
    tarifaMaximaDiaria: cabecera.tarifa_maxima_diaria,
    preciosPorBloque: bloques.map((b) => b.precio)
  }
}

export interface ActualizarTarifaProgresivaInput {
  estacionamientoId: number
  tipoVehiculoId: number
  tarifaMaximaDiaria: number
  preciosPorBloque: number[]
}

/**
 * Cierra la tarifa progresiva activa del tipo de vehículo (si existe) y crea
 * una nueva vigente. Los boletos ya abiertos quedan atados a la tarifa vieja
 * (snapshot en boletos.tarifa_progresiva_id), así que esto no les afecta.
 */
export function actualizarTarifaProgresiva(db: DB, input: ActualizarTarifaProgresivaInput): TarifaProgresivaAdmin {
  if (input.preciosPorBloque.length !== BLOQUES_CONFIGURABLES) {
    throw new Error(
      `Se esperaban ${BLOQUES_CONFIGURABLES} precios de bloque, llegaron ${input.preciosPorBloque.length}`
    )
  }

  const transaccion = db.transaction((): TarifaProgresivaAdmin => {
    const ahora = new Date().toISOString()

    db.prepare(
      'UPDATE tarifas_progresivas SET vigente_hasta = ? WHERE tipo_vehiculo_id = ? AND vigente_hasta IS NULL'
    ).run(ahora, input.tipoVehiculoId)

    const nuevaId = db
      .prepare(
        `INSERT INTO tarifas_progresivas (estacionamiento_id, tipo_vehiculo_id, tarifa_maxima_diaria, vigente_desde)
         VALUES (?,?,?,?)`
      )
      .run(input.estacionamientoId, input.tipoVehiculoId, input.tarifaMaximaDiaria, ahora).lastInsertRowid as number

    const insertarBloque = db.prepare(
      'INSERT INTO tarifas_progresivas_bloques (tarifa_progresiva_id, numero_bloque, precio) VALUES (?,?,?)'
    )
    input.preciosPorBloque.forEach((precio, i) => insertarBloque.run(nuevaId, i + 1, precio))

    return { id: nuevaId, tarifaMaximaDiaria: input.tarifaMaximaDiaria, preciosPorBloque: input.preciosPorBloque }
  })

  return transaccion()
}

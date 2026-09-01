import type { DB } from './index'

export interface Pensionado {
  id: number
  nombre: string
  telefono: string | null
  placa: string | null
  tipoVehiculoId: number
  tipoVehiculo: string
  cuotaMensual: number
  fechaAlta: string
  estado: 'activo' | 'baja'
  fechaBaja: string | null
  vigenteHasta: string
}

interface PensionadoRow {
  id: number
  nombre: string
  telefono: string | null
  placa: string | null
  tipo_vehiculo_id: number
  tipoVehiculo: string
  cuota_mensual: number
  fecha_alta: string
  estado: string
  fecha_baja: string | null
}

function obtenerVigenteHasta(db: DB, pensionadoId: number, fechaAlta: string): string {
  const ultimoPago = db
    .prepare<[number], { periodo_hasta: string }>(
      'SELECT periodo_hasta FROM pensionados_pagos WHERE pensionado_id = ? ORDER BY periodo_hasta DESC LIMIT 1'
    )
    .get(pensionadoId)
  return ultimoPago?.periodo_hasta ?? fechaAlta
}

function mapearFila(db: DB, fila: PensionadoRow): Pensionado {
  return {
    id: fila.id,
    nombre: fila.nombre,
    telefono: fila.telefono,
    placa: fila.placa,
    tipoVehiculoId: fila.tipo_vehiculo_id,
    tipoVehiculo: fila.tipoVehiculo,
    cuotaMensual: fila.cuota_mensual,
    fechaAlta: fila.fecha_alta,
    estado: fila.estado as 'activo' | 'baja',
    fechaBaja: fila.fecha_baja,
    vigenteHasta: obtenerVigenteHasta(db, fila.id, fila.fecha_alta)
  }
}

/** Por default solo activos — pásale incluirBajas para ver también los dados de baja (historial). */
export function listarPensionados(db: DB, estacionamientoId: number, incluirBajas = false): Pensionado[] {
  const filas = db
    .prepare<[number], PensionadoRow>(
      `SELECT p.id, p.nombre, p.telefono, p.placa, p.tipo_vehiculo_id, tv.nombre AS tipoVehiculo,
              p.cuota_mensual, p.fecha_alta, p.estado, p.fecha_baja
       FROM pensionados p
       JOIN tipos_vehiculo tv ON tv.id = p.tipo_vehiculo_id
       WHERE p.estacionamiento_id = ? ${incluirBajas ? '' : "AND p.estado = 'activo'"}
       ORDER BY p.nombre`
    )
    .all(estacionamientoId)

  return filas.map((fila) => mapearFila(db, fila))
}

export interface NuevoPensionadoInput {
  estacionamientoId: number
  nombre: string
  telefono?: string | null
  placa?: string | null
  tipoVehiculoId: number
  cuotaMensual: number
  usuarioAltaId: number
}

export function crearPensionado(db: DB, input: NuevoPensionadoInput): Pensionado {
  if (!input.nombre.trim()) {
    throw new Error('El nombre no puede estar vacío')
  }

  const fechaAlta = new Date().toISOString()
  const id = db
    .prepare(
      `INSERT INTO pensionados
         (estacionamiento_id, nombre, telefono, placa, tipo_vehiculo_id, cuota_mensual, fecha_alta, usuario_alta_id)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      input.estacionamientoId,
      input.nombre.trim(),
      input.telefono?.trim() || null,
      input.placa?.trim().toUpperCase() || null,
      input.tipoVehiculoId,
      input.cuotaMensual,
      fechaAlta,
      input.usuarioAltaId
    ).lastInsertRowid as number

  return listarPensionados(db, input.estacionamientoId, true).find((p) => p.id === id)!
}

export interface DarDeBajaInput {
  id: number
  usuarioBajaId: number
}

export function darDeBajaPensionado(db: DB, input: DarDeBajaInput): void {
  const fila = db.prepare<[number], { estado: string }>('SELECT estado FROM pensionados WHERE id = ?').get(input.id)
  if (!fila) {
    throw new Error(`No existe el pensionado ${input.id}`)
  }
  if (fila.estado === 'baja') {
    throw new Error('Este pensionado ya está dado de baja')
  }

  db.prepare("UPDATE pensionados SET estado = 'baja', fecha_baja = ?, usuario_baja_id = ? WHERE id = ?").run(
    new Date().toISOString(),
    input.usuarioBajaId,
    input.id
  )
}

export interface RegistrarPagoInput {
  pensionadoId: number
  periodoDesde: string
  periodoHasta: string
  monto: number
  usuarioId: number
}

export interface PagoPensionado {
  id: number
  pensionadoId: number
  periodoDesde: string
  periodoHasta: string
  monto: number
}

export function registrarPago(db: DB, input: RegistrarPagoInput): PagoPensionado {
  const pensionado = db
    .prepare<[number], { estado: string }>('SELECT estado FROM pensionados WHERE id = ?')
    .get(input.pensionadoId)
  if (!pensionado) {
    throw new Error(`No existe el pensionado ${input.pensionadoId}`)
  }
  if (pensionado.estado === 'baja') {
    throw new Error('No se puede registrar un pago de un pensionado dado de baja')
  }
  if (new Date(input.periodoHasta) <= new Date(input.periodoDesde)) {
    throw new Error('El periodo debe terminar después de que empieza')
  }

  const id = db
    .prepare(
      `INSERT INTO pensionados_pagos (pensionado_id, periodo_desde, periodo_hasta, monto, usuario_id)
       VALUES (?,?,?,?,?)`
    )
    .run(input.pensionadoId, input.periodoDesde, input.periodoHasta, input.monto, input.usuarioId).lastInsertRowid as number

  return { id, pensionadoId: input.pensionadoId, periodoDesde: input.periodoDesde, periodoHasta: input.periodoHasta, monto: input.monto }
}

export interface PagoPensionadoEnPeriodo {
  id: number
  pensionadoNombre: string
  monto: number
  periodoDesde: string
  periodoHasta: string
  fechaPago: string
}

export interface EventoPensionadoEnPeriodo {
  id: number
  nombre: string
  fecha: string
}

export interface ResumenPensionadosPeriodo {
  pagosCantidad: number
  pagosMonto: number
  pagos: PagoPensionadoEnPeriodo[]
  altas: EventoPensionadoEnPeriodo[]
  bajas: EventoPensionadoEnPeriodo[]
}

/**
 * Pagos, altas y bajas de pensionados en el rango (desde, hasta] — lo usan
 * tanto el corte de turno (src/db/cortes.ts) como el corte mensual
 * (src/db/corteMensual.ts), para no duplicar estas consultas en los dos.
 * `pagosMonto` se cuenta por `created_at` (cuándo se cobró), no por el
 * periodo de mensualidad que cubre el pago.
 */
export function obtenerResumenPensionadosPeriodo(
  db: DB,
  estacionamientoId: number,
  desde: string,
  hasta: string
): ResumenPensionadosPeriodo {
  const pagos = db
    .prepare<[number, string, string], PagoPensionadoEnPeriodo>(
      `SELECT pp.id, p.nombre AS pensionadoNombre, pp.monto,
              pp.periodo_desde AS periodoDesde, pp.periodo_hasta AS periodoHasta, pp.created_at AS fechaPago
       FROM pensionados_pagos pp
       JOIN pensionados p ON p.id = pp.pensionado_id
       WHERE p.estacionamiento_id = ? AND pp.created_at > ? AND pp.created_at <= ?
       ORDER BY pp.created_at`
    )
    .all(estacionamientoId, desde, hasta)

  const altas = db
    .prepare<[number, string, string], EventoPensionadoEnPeriodo>(
      `SELECT id, nombre, fecha_alta AS fecha
       FROM pensionados
       WHERE estacionamiento_id = ? AND fecha_alta > ? AND fecha_alta <= ?
       ORDER BY fecha_alta`
    )
    .all(estacionamientoId, desde, hasta)

  const bajas = db
    .prepare<[number, string, string], EventoPensionadoEnPeriodo>(
      `SELECT id, nombre, fecha_baja AS fecha
       FROM pensionados
       WHERE estacionamiento_id = ? AND fecha_baja IS NOT NULL AND fecha_baja > ? AND fecha_baja <= ?
       ORDER BY fecha_baja`
    )
    .all(estacionamientoId, desde, hasta)

  return {
    pagosCantidad: pagos.length,
    pagosMonto: pagos.reduce((acc, p) => acc + p.monto, 0),
    pagos,
    altas,
    bajas
  }
}

export interface PeriodoSugerido {
  periodoDesde: string
  periodoHasta: string
}

/** Sugiere el siguiente periodo a cobrar: desde el día en que vence lo ya pagado (o desde el alta si nunca ha pagado), un mes de duración. */
export function sugerirSiguientePeriodo(db: DB, pensionadoId: number): PeriodoSugerido {
  const pensionado = db
    .prepare<[number], { fecha_alta: string }>('SELECT fecha_alta FROM pensionados WHERE id = ?')
    .get(pensionadoId)
  if (!pensionado) {
    throw new Error(`No existe el pensionado ${pensionadoId}`)
  }

  const vigenteHasta = obtenerVigenteHasta(db, pensionadoId, pensionado.fecha_alta)
  const periodoDesde = new Date(vigenteHasta)
  const periodoHasta = new Date(vigenteHasta)
  periodoHasta.setMonth(periodoHasta.getMonth() + 1)

  return { periodoDesde: periodoDesde.toISOString(), periodoHasta: periodoHasta.toISOString() }
}

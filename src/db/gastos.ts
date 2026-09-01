import type { DB } from './index'

export type CategoriaGasto = 'operativo' | 'nomina' | 'servicios' | 'otro'
export type FormaPagoGasto = 'efectivo' | 'transferencia' | 'otro'

export interface Gasto {
  id: number
  concepto: string
  categoria: CategoriaGasto
  monto: number
  formaPago: FormaPagoGasto
  fecha: string
  usuarioId: number
}

interface GastoRow {
  id: number
  concepto: string
  categoria: string
  monto: number
  forma_pago: string
  fecha: string
  usuario_id: number
}

function mapearGasto(f: GastoRow): Gasto {
  return {
    id: f.id,
    concepto: f.concepto,
    categoria: f.categoria as CategoriaGasto,
    monto: f.monto,
    formaPago: f.forma_pago as FormaPagoGasto,
    fecha: f.fecha,
    usuarioId: f.usuario_id
  }
}

export interface NuevoGastoInput {
  estacionamientoId: number
  concepto: string
  categoria: CategoriaGasto
  monto: number
  formaPago: FormaPagoGasto
  fecha: string
  usuarioId: number
}

export function registrarGasto(db: DB, input: NuevoGastoInput): Gasto {
  if (!input.concepto.trim()) {
    throw new Error('El concepto no puede estar vacío')
  }
  if (input.monto <= 0) {
    throw new Error('El monto debe ser mayor a 0')
  }

  const id = db
    .prepare(
      `INSERT INTO gastos (estacionamiento_id, concepto, categoria, monto, forma_pago, fecha, usuario_id)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(
      input.estacionamientoId,
      input.concepto.trim(),
      input.categoria,
      input.monto,
      input.formaPago,
      input.fecha,
      input.usuarioId
    ).lastInsertRowid as number

  return {
    id,
    concepto: input.concepto.trim(),
    categoria: input.categoria,
    monto: input.monto,
    formaPago: input.formaPago,
    fecha: input.fecha,
    usuarioId: input.usuarioId
  }
}

export interface RangoFechas {
  desde?: string
  hasta?: string
}

/** Sin rango: los 100 más recientes. Con rango, todos los que caigan en (desde, hasta] — mismo criterio que los cortes. */
export function listarGastos(db: DB, estacionamientoId: number, rango: RangoFechas = {}): Gasto[] {
  if (rango.desde != null && rango.hasta != null) {
    const filas = db
      .prepare<[number, string, string], GastoRow>(
        `SELECT id, concepto, categoria, monto, forma_pago, fecha, usuario_id
         FROM gastos
         WHERE estacionamiento_id = ? AND fecha > ? AND fecha <= ?
         ORDER BY fecha DESC`
      )
      .all(estacionamientoId, rango.desde, rango.hasta)
    return filas.map(mapearGasto)
  }

  const filas = db
    .prepare<[number], GastoRow>(
      `SELECT id, concepto, categoria, monto, forma_pago, fecha, usuario_id
       FROM gastos WHERE estacionamiento_id = ? ORDER BY fecha DESC LIMIT 100`
    )
    .all(estacionamientoId)
  return filas.map(mapearGasto)
}

export interface ResumenGastosPorCategoria {
  categoria: CategoriaGasto
  cantidad: number
  monto: number
}

export interface ResumenGastosPeriodo {
  efectivoCantidad: number
  efectivoMonto: number
  gastos: Gasto[]
  porCategoria: ResumenGastosPorCategoria[]
}

/**
 * Gastos del rango (desde, hasta] — lo usan tanto el corte de turno
 * (src/db/cortes.ts) como el corte mensual (src/db/corteMensual.ts).
 * `efectivoMonto` es lo único que se resta del "total en caja": solo los
 * gastos pagados en efectivo salen de la caja del estacionamiento (ver
 * comentario en schema.sql) — `gastos` trae TODOS, sin importar forma de
 * pago, para que el reporte los muestre completos.
 */
export function obtenerResumenGastosPeriodo(db: DB, estacionamientoId: number, desde: string, hasta: string): ResumenGastosPeriodo {
  const gastos = listarGastos(db, estacionamientoId, { desde, hasta })
  const deEfectivo = gastos.filter((g) => g.formaPago === 'efectivo')

  const porCategoriaMapa = new Map<CategoriaGasto, { cantidad: number; monto: number }>()
  for (const gasto of gastos) {
    const actual = porCategoriaMapa.get(gasto.categoria) ?? { cantidad: 0, monto: 0 }
    actual.cantidad += 1
    actual.monto += gasto.monto
    porCategoriaMapa.set(gasto.categoria, actual)
  }

  return {
    efectivoCantidad: deEfectivo.length,
    efectivoMonto: deEfectivo.reduce((acc, g) => acc + g.monto, 0),
    gastos,
    porCategoria: [...porCategoriaMapa.entries()].map(([categoria, r]) => ({ categoria, ...r }))
  }
}

export function eliminarGasto(db: DB, id: number): void {
  const resultado = db.prepare('DELETE FROM gastos WHERE id = ?').run(id)
  if (resultado.changes === 0) {
    throw new Error(`No existe el gasto ${id}`)
  }
}

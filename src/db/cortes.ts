import type { DB } from './index'

export interface Corte {
  id: number
  desde: string
  hasta: string
  totalBoletos: number
  totalMonto: number
  usuarioId: number
}

interface CorteRow {
  id: number
  estacionamiento_id: number
  desde: string
  hasta: string
  total_boletos: number
  total_monto: number
  usuario_id: number
}

function mapearCorte(f: CorteRow): Corte {
  return { id: f.id, desde: f.desde, hasta: f.hasta, totalBoletos: f.total_boletos, totalMonto: f.total_monto, usuarioId: f.usuario_id }
}

/**
 * Inicio del periodo todavía no cortado: el `hasta` del último corte, o la
 * fecha de creación del estacionamiento si nunca se ha hecho uno. La usan
 * tanto hacerCorte (para saber qué sumar) como el resumen en vivo de la
 * pantalla de operación (para "entradas desde el último corte").
 */
export function obtenerInicioPeriodoActual(db: DB, estacionamientoId: number): string {
  const ultimo = db
    .prepare<[number], { hasta: string }>(
      'SELECT hasta FROM cortes WHERE estacionamiento_id = ? ORDER BY hasta DESC LIMIT 1'
    )
    .get(estacionamientoId)

  if (ultimo) return ultimo.hasta

  return db
    .prepare<[number], { created_at: string }>('SELECT created_at FROM estacionamientos WHERE id = ?')
    .get(estacionamientoId)!.created_at
}

/**
 * Cierra el periodo desde el último corte (o desde que se creó el
 * estacionamiento, si es el primero) hasta ahora, sumando los boletos
 * cobrados en ese rango, de todas las series juntas. No incluye boletos que
 * sigan abiertos — esos entran en el siguiente corte cuando se cobren.
 */
export function hacerCorte(db: DB, estacionamientoId: number, usuarioId: number): Corte {
  const transaccion = db.transaction((): Corte => {
    const desde = obtenerInicioPeriodoActual(db, estacionamientoId)
    const hasta = new Date().toISOString()

    const { n, total } = db
      .prepare<[number, string, string], { n: number; total: number }>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(monto_cobrado), 0) AS total
         FROM boletos
         WHERE estacionamiento_id = ? AND estado = 'cerrado' AND hora_salida > ? AND hora_salida <= ?`
      )
      .get(estacionamientoId, desde, hasta)!

    const id = db
      .prepare(
        'INSERT INTO cortes (estacionamiento_id, desde, hasta, total_boletos, total_monto, usuario_id) VALUES (?,?,?,?,?,?)'
      )
      .run(estacionamientoId, desde, hasta, n, total, usuarioId).lastInsertRowid as number

    return { id, desde, hasta, totalBoletos: n, totalMonto: total, usuarioId }
  })

  return transaccion()
}

export function listarCortes(db: DB, estacionamientoId: number): Corte[] {
  const filas = db
    .prepare<[number], CorteRow>('SELECT * FROM cortes WHERE estacionamiento_id = ? ORDER BY hasta DESC LIMIT 50')
    .all(estacionamientoId)
  return filas.map(mapearCorte)
}

export interface DetalleCortePorTipo {
  tipoVehiculo: string
  boletos: number
  monto: number
}

export interface DetalleCorteBoleto {
  id: number
  serie: string
  folio: number
  tipoVehiculo: string
  horaEntrada: string
  horaSalida: string
  monto: number
}

export interface DetalleCortePorSerie {
  serie: string
  boletos: DetalleCorteBoleto[]
  totalBoletos: number
  totalMonto: number
}

export interface DetalleCorte extends Corte {
  porTipoVehiculo: DetalleCortePorTipo[]
  porSerie: DetalleCortePorSerie[]
}

interface DetalleCorteBoletoRow {
  id: number
  serie: string
  folio: number
  tipoVehiculo: string
  horaEntrada: string
  horaSalida: string
  monto: number
}

/**
 * Reconstruye el detalle completo del corte a partir del rango (desde, hasta]
 * guardado: el total por tipo de vehículo, y cada boleto individual agrupado
 * por serie (con su propio subtotal) — así se puede imprimir un reporte por
 * serie o uno general con todo junto, sin que sean cosas distintas contadas
 * dos veces: es la misma consulta, solo agrupada distinto para mostrarla.
 */
export function obtenerDetalleCorte(db: DB, corteId: number): DetalleCorte {
  const corte = db.prepare<[number], CorteRow>('SELECT * FROM cortes WHERE id = ?').get(corteId)
  if (!corte) {
    throw new Error(`No existe el corte ${corteId}`)
  }

  const porTipoVehiculo = db
    .prepare<[number, string, string], DetalleCortePorTipo>(
      `SELECT tv.nombre AS tipoVehiculo, COUNT(*) AS boletos, COALESCE(SUM(b.monto_cobrado), 0) AS monto
       FROM boletos b
       JOIN tipos_vehiculo tv ON tv.id = b.tipo_vehiculo_id
       WHERE b.estacionamiento_id = ? AND b.estado = 'cerrado' AND b.hora_salida > ? AND b.hora_salida <= ?
       GROUP BY tv.nombre
       ORDER BY tv.nombre`
    )
    .all(corte.estacionamiento_id, corte.desde, corte.hasta)

  const filasBoletos = db
    .prepare<[number, string, string], DetalleCorteBoletoRow>(
      `SELECT b.id, b.serie, b.folio, tv.nombre AS tipoVehiculo,
              b.hora_entrada AS horaEntrada, b.hora_salida AS horaSalida, b.monto_cobrado AS monto
       FROM boletos b
       JOIN tipos_vehiculo tv ON tv.id = b.tipo_vehiculo_id
       WHERE b.estacionamiento_id = ? AND b.estado = 'cerrado' AND b.hora_salida > ? AND b.hora_salida <= ?
       ORDER BY b.serie, b.folio`
    )
    .all(corte.estacionamiento_id, corte.desde, corte.hasta)

  const porSerieMapa = new Map<string, DetalleCorteBoleto[]>()
  for (const fila of filasBoletos) {
    const lista = porSerieMapa.get(fila.serie) ?? []
    lista.push(fila)
    porSerieMapa.set(fila.serie, lista)
  }

  const porSerie: DetalleCortePorSerie[] = [...porSerieMapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([serie, boletos]) => ({
      serie,
      boletos,
      totalBoletos: boletos.length,
      totalMonto: boletos.reduce((acc, b) => acc + b.monto, 0)
    }))

  return { ...mapearCorte(corte), porTipoVehiculo, porSerie }
}

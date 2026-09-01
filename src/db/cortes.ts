import type { DB } from './index'
import { listarSeries } from './series'
import { obtenerResumenPensionadosPeriodo, PagoPensionadoEnPeriodo, EventoPensionadoEnPeriodo } from './pensionados'
import { obtenerResumenGastosPeriodo, Gasto } from './gastos'

export interface Corte {
  id: number
  desde: string
  hasta: string
  totalBoletos: number
  totalMonto: number
  pensionadosPagosCantidad: number
  pensionadosPagosMonto: number
  gastosEfectivoCantidad: number
  gastosEfectivoMonto: number
  usuarioId: number
}

interface CorteRow {
  id: number
  estacionamiento_id: number
  desde: string
  hasta: string
  total_boletos: number
  total_monto: number
  pensionados_pagos_cantidad: number
  pensionados_pagos_monto: number
  gastos_efectivo_cantidad: number
  gastos_efectivo_monto: number
  usuario_id: number
}

function mapearCorte(f: CorteRow): Corte {
  return {
    id: f.id,
    desde: f.desde,
    hasta: f.hasta,
    totalBoletos: f.total_boletos,
    totalMonto: f.total_monto,
    pensionadosPagosCantidad: f.pensionados_pagos_cantidad,
    pensionadosPagosMonto: f.pensionados_pagos_monto,
    gastosEfectivoCantidad: f.gastos_efectivo_cantidad,
    gastosEfectivoMonto: f.gastos_efectivo_monto,
    usuarioId: f.usuario_id
  }
}

/**
 * Inicio del periodo todavía no cortado para pensionados/gastos (que no
 * tienen concepto de serie): el `hasta` del último corte, o la fecha de
 * creación del estacionamiento si nunca se ha hecho uno. También la usa el
 * resumen en vivo de la pantalla de operación ("entradas desde el último
 * corte") y, como respaldo, `obtenerInicioPeriodoBoletosPorSerie` para una
 * serie que todavía no tiene su propio historial en `cortes_series`.
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
 * Inicio del periodo todavía no cortado para UNA SERIE de boletos: el
 * `hasta` del corte más reciente que sí incluyó a esa serie. Una serie
 * desactivada al momento de un corte no genera renglón en `cortes_series`
 * (ver hacerCorte), así que este valor simplemente no avanza para ella
 * hasta que vuelva a incluirse — no se pierde ni se duplica lo cobrado
 * mientras estuvo pausada.
 *
 * Si la serie nunca ha tenido su propio renglón todavía, el respaldo NO
 * puede ser "el corte más reciente" a secas — ese corte pudo ser uno nuevo
 * que a propósito excluyó a esta serie (justo el caso que se quiere evitar:
 * usar su `hasta` como punto de arranque perdería todo lo cobrado en esta
 * serie entre el último corte viejo y ese corte nuevo). El respaldo
 * correcto es el corte "viejo" más reciente — uno de antes de este cambio,
 * que por definición no tiene ningún renglón en `cortes_series` y sí cubría
 * a todas las series por igual. Si nunca ha habido ninguno (instalación
 * nueva, usando este mecanismo desde el principio), se cae hasta la fecha
 * de creación del estacionamiento.
 */
export function obtenerInicioPeriodoBoletosPorSerie(db: DB, estacionamientoId: number, serie: string): string {
  const propio = db
    .prepare<[number, string], { hasta: string }>(
      `SELECT cs.hasta
       FROM cortes_series cs
       JOIN cortes c ON c.id = cs.corte_id
       WHERE c.estacionamiento_id = ? AND cs.serie = ?
       ORDER BY cs.hasta DESC LIMIT 1`
    )
    .get(estacionamientoId, serie)
  if (propio) return propio.hasta

  const ultimoCorteViejo = db
    .prepare<[number], { hasta: string }>(
      `SELECT c.hasta
       FROM cortes c
       WHERE c.estacionamiento_id = ? AND NOT EXISTS (SELECT 1 FROM cortes_series cs WHERE cs.corte_id = c.id)
       ORDER BY c.hasta DESC LIMIT 1`
    )
    .get(estacionamientoId)
  if (ultimoCorteViejo) return ultimoCorteViejo.hasta

  return db
    .prepare<[number], { created_at: string }>('SELECT created_at FROM estacionamientos WHERE id = ?')
    .get(estacionamientoId)!.created_at
}

interface ResumenBoletosSerie {
  serie: string
  desde: string
  hasta: string
  totalBoletos: number
  totalMonto: number
}

function sumarBoletosDeSerie(db: DB, estacionamientoId: number, serie: string, desde: string, hasta: string): ResumenBoletosSerie {
  const { n, total } = db
    .prepare<[number, string, string, string], { n: number; total: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(monto_cobrado), 0) AS total
       FROM boletos
       WHERE estacionamiento_id = ? AND serie = ? AND estado = 'cerrado' AND hora_salida > ? AND hora_salida <= ?`
    )
    .get(estacionamientoId, serie, desde, hasta)!
  return { serie, desde, hasta, totalBoletos: n, totalMonto: total }
}

/**
 * Cierra el periodo pendiente de cada serie ACTIVA (cada una con su propio
 * rango — ver obtenerInicioPeriodoBoletosPorSerie) hasta ahora, y guarda un
 * renglón por serie en `cortes_series`. Una serie desactivada en este
 * momento (ej. modo "solo serie A") no se toca en absoluto: ni se cuenta
 * aquí, ni su punto de corte avanza — sigue esperando hasta que vuelva a
 * estar activa en un corte futuro. No incluye boletos que sigan abiertos
 * — esos entran cuando se cobren, al corte de su serie que corresponda.
 *
 * Pensionados y gastos en efectivo del rango compartido se suman aparte,
 * igual que siempre (no tienen concepto de serie). El "total en caja"
 * (boletos + pensionados - gastos en efectivo) se calcula donde se
 * muestra, no se guarda.
 */
export function hacerCorte(db: DB, estacionamientoId: number, usuarioId: number): Corte {
  const transaccion = db.transaction((): Corte => {
    const desde = obtenerInicioPeriodoActual(db, estacionamientoId)
    const hasta = new Date().toISOString()

    const seriesActivas = listarSeries(db, estacionamientoId).filter((s) => s.activo)
    const resumenesPorSerie = seriesActivas.map((s) =>
      sumarBoletosDeSerie(db, estacionamientoId, s.serie, obtenerInicioPeriodoBoletosPorSerie(db, estacionamientoId, s.serie), hasta)
    )

    const n = resumenesPorSerie.reduce((acc, r) => acc + r.totalBoletos, 0)
    const total = resumenesPorSerie.reduce((acc, r) => acc + r.totalMonto, 0)

    const resumenPensionados = obtenerResumenPensionadosPeriodo(db, estacionamientoId, desde, hasta)
    const resumenGastos = obtenerResumenGastosPeriodo(db, estacionamientoId, desde, hasta)

    const id = db
      .prepare(
        `INSERT INTO cortes
           (estacionamiento_id, desde, hasta, total_boletos, total_monto,
            pensionados_pagos_cantidad, pensionados_pagos_monto, gastos_efectivo_cantidad, gastos_efectivo_monto, usuario_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        estacionamientoId,
        desde,
        hasta,
        n,
        total,
        resumenPensionados.pagosCantidad,
        resumenPensionados.pagosMonto,
        resumenGastos.efectivoCantidad,
        resumenGastos.efectivoMonto,
        usuarioId
      ).lastInsertRowid as number

    const insertarSerie = db.prepare(
      'INSERT INTO cortes_series (corte_id, serie, desde, hasta, total_boletos, total_monto) VALUES (?,?,?,?,?,?)'
    )
    for (const r of resumenesPorSerie) {
      insertarSerie.run(id, r.serie, r.desde, r.hasta, r.totalBoletos, r.totalMonto)
    }

    return {
      id,
      desde,
      hasta,
      totalBoletos: n,
      totalMonto: total,
      pensionadosPagosCantidad: resumenPensionados.pagosCantidad,
      pensionadosPagosMonto: resumenPensionados.pagosMonto,
      gastosEfectivoCantidad: resumenGastos.efectivoCantidad,
      gastosEfectivoMonto: resumenGastos.efectivoMonto,
      usuarioId
    }
  })

  return transaccion()
}

export function listarCortes(db: DB, estacionamientoId: number): Corte[] {
  const filas = db
    .prepare<[number], CorteRow>('SELECT * FROM cortes WHERE estacionamiento_id = ? ORDER BY hasta DESC LIMIT 50')
    .all(estacionamientoId)
  return filas.map(mapearCorte)
}

/** Sin límite de 50 (a diferencia de listarCortes) — la usa el corte mensual, donde un mes activo puede tener más. */
export function listarCortesEnRango(db: DB, estacionamientoId: number, desde: string, hasta: string): Corte[] {
  const filas = db
    .prepare<[number, string, string], CorteRow>(
      'SELECT * FROM cortes WHERE estacionamiento_id = ? AND hasta > ? AND hasta <= ? ORDER BY hasta'
    )
    .all(estacionamientoId, desde, hasta)
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
  desde: string
  hasta: string
  boletos: DetalleCorteBoleto[]
  totalBoletos: number
  totalMonto: number
}

export interface DetalleCorte extends Corte {
  porTipoVehiculo: DetalleCortePorTipo[]
  porSerie: DetalleCortePorSerie[]
  pagosPensionados: PagoPensionadoEnPeriodo[]
  altasPensionados: EventoPensionadoEnPeriodo[]
  bajasPensionados: EventoPensionadoEnPeriodo[]
  gastosDelPeriodo: Gasto[]
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

function boletosDeSerieEnRango(
  db: DB,
  estacionamientoId: number,
  serie: string,
  desde: string,
  hasta: string
): DetalleCorteBoletoRow[] {
  return db
    .prepare<[number, string, string, string], DetalleCorteBoletoRow>(
      `SELECT b.id, b.serie, b.folio, tv.nombre AS tipoVehiculo,
              b.hora_entrada AS horaEntrada, b.hora_salida AS horaSalida, b.monto_cobrado AS monto
       FROM boletos b
       JOIN tipos_vehiculo tv ON tv.id = b.tipo_vehiculo_id
       WHERE b.estacionamiento_id = ? AND b.serie = ? AND b.estado = 'cerrado' AND b.hora_salida > ? AND b.hora_salida <= ?
       ORDER BY b.folio`
    )
    .all(estacionamientoId, serie, desde, hasta)
}

/**
 * Reconstruye el detalle completo del corte. Si el corte tiene renglones en
 * `cortes_series` (todos los generados con hacerCorte desde este cambio en
 * adelante), cada serie usa SU PROPIO rango real — pueden diferir entre sí
 * si alguna estuvo pausada. Un corte de ANTES de este cambio no tiene esos
 * renglones: para no dejar su detalle vacío, cae al comportamiento de
 * siempre (un solo rango del corte para todas las series juntas).
 */
export function obtenerDetalleCorte(db: DB, corteId: number): DetalleCorte {
  const corte = db.prepare<[number], CorteRow>('SELECT * FROM cortes WHERE id = ?').get(corteId)
  if (!corte) {
    throw new Error(`No existe el corte ${corteId}`)
  }

  const renglonesSerie = db
    .prepare<[number], { serie: string; desde: string; hasta: string }>(
      'SELECT serie, desde, hasta FROM cortes_series WHERE corte_id = ? ORDER BY serie'
    )
    .all(corteId)

  const rangosPorSerie: { serie: string; desde: string; hasta: string }[] =
    renglonesSerie.length > 0 ? renglonesSerie : [{ serie: '', desde: corte.desde, hasta: corte.hasta }]

  const todosLosBoletos: DetalleCorteBoletoRow[] = []
  const porSerie: DetalleCortePorSerie[] = []

  for (const rango of rangosPorSerie) {
    // Corte viejo (sin renglones): un solo "rango" ficticio con serie=''
    // que en realidad cubre TODAS las series juntas, igual que antes.
    const boletos =
      renglonesSerie.length > 0
        ? boletosDeSerieEnRango(db, corte.estacionamiento_id, rango.serie, rango.desde, rango.hasta)
        : db
            .prepare<[number, string, string], DetalleCorteBoletoRow>(
              `SELECT b.id, b.serie, b.folio, tv.nombre AS tipoVehiculo,
                      b.hora_entrada AS horaEntrada, b.hora_salida AS horaSalida, b.monto_cobrado AS monto
               FROM boletos b
               JOIN tipos_vehiculo tv ON tv.id = b.tipo_vehiculo_id
               WHERE b.estacionamiento_id = ? AND b.estado = 'cerrado' AND b.hora_salida > ? AND b.hora_salida <= ?
               ORDER BY b.serie, b.folio`
            )
            .all(corte.estacionamiento_id, rango.desde, rango.hasta)

    todosLosBoletos.push(...boletos)

    if (renglonesSerie.length > 0) {
      porSerie.push({
        serie: rango.serie,
        desde: rango.desde,
        hasta: rango.hasta,
        boletos,
        totalBoletos: boletos.length,
        totalMonto: boletos.reduce((acc, b) => acc + b.monto, 0)
      })
    }
  }

  // Corte viejo: agrupar los boletos (de todas las series juntas) por su
  // propia serie, como se hacía antes de este cambio.
  if (renglonesSerie.length === 0) {
    const porSerieMapa = new Map<string, DetalleCorteBoleto[]>()
    for (const fila of todosLosBoletos) {
      const lista = porSerieMapa.get(fila.serie) ?? []
      lista.push(fila)
      porSerieMapa.set(fila.serie, lista)
    }
    for (const [serie, boletos] of [...porSerieMapa.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      porSerie.push({
        serie,
        desde: corte.desde,
        hasta: corte.hasta,
        boletos,
        totalBoletos: boletos.length,
        totalMonto: boletos.reduce((acc, b) => acc + b.monto, 0)
      })
    }
  }

  const porTipoVehiculoMapa = new Map<string, { boletos: number; monto: number }>()
  for (const b of todosLosBoletos) {
    const actual = porTipoVehiculoMapa.get(b.tipoVehiculo) ?? { boletos: 0, monto: 0 }
    actual.boletos += 1
    actual.monto += b.monto
    porTipoVehiculoMapa.set(b.tipoVehiculo, actual)
  }
  const porTipoVehiculo: DetalleCortePorTipo[] = [...porTipoVehiculoMapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tipoVehiculo, r]) => ({ tipoVehiculo, ...r }))

  const resumenPensionados = obtenerResumenPensionadosPeriodo(db, corte.estacionamiento_id, corte.desde, corte.hasta)
  const resumenGastos = obtenerResumenGastosPeriodo(db, corte.estacionamiento_id, corte.desde, corte.hasta)

  return {
    ...mapearCorte(corte),
    porTipoVehiculo,
    porSerie,
    pagosPensionados: resumenPensionados.pagos,
    altasPensionados: resumenPensionados.altas,
    bajasPensionados: resumenPensionados.bajas,
    gastosDelPeriodo: resumenGastos.gastos
  }
}

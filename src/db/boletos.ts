import type { DB } from './index'
import { asignarSiguienteFolio } from './series'
import { obtenerTarifaProgresiva, obtenerTarifaPlana } from './tarifas'
import { obtenerInicioPeriodoActual } from './cortes'
import { calcularCobro } from '../logic/motorTarifas'

export interface NuevoBoletoInput {
  estacionamientoId: number
  tipoVehiculoId: number
  usuarioEmisionId: number
  placa?: string | null
  tarifaPlanaId?: number | null
}

export interface BoletoEmitido {
  id: number
  serie: string
  folio: number
  tipoVehiculoId: number
  horaEntrada: string
  tarifaPlanaId: number | null
}

/**
 * Emite un boleto: toma la tarifa progresiva vigente del tipo de vehículo,
 * asigna folio (ver src/db/series.ts) y guarda el boleto abierto. Si se pasa
 * tarifaPlanaId, se valida que esté vigente y activa para ese tipo de
 * vehículo — la tarifa plana se ofrece y decide aquí, al emitir, no al cobrar.
 * Todo en una transacción — si falla algo, no queda nada a medias.
 */
export function emitirBoleto(db: DB, input: NuevoBoletoInput): BoletoEmitido {
  const transaccion = db.transaction((): BoletoEmitido => {
    const tarifa = db
      .prepare<[number, number], { id: number }>(
        `SELECT id FROM tarifas_progresivas
         WHERE estacionamiento_id = ? AND tipo_vehiculo_id = ? AND vigente_hasta IS NULL`
      )
      .get(input.estacionamientoId, input.tipoVehiculoId)

    if (!tarifa) {
      throw new Error('No hay una tarifa progresiva vigente para este tipo de vehículo')
    }

    if (input.tarifaPlanaId != null) {
      const plana = db
        .prepare<[number, number, number], { id: number }>(
          `SELECT id FROM tarifas_planas
           WHERE id = ? AND estacionamiento_id = ? AND tipo_vehiculo_id = ? AND activo = 1 AND vigente_hasta IS NULL`
        )
        .get(input.tarifaPlanaId, input.estacionamientoId, input.tipoVehiculoId)

      if (!plana) {
        throw new Error('La tarifa plana seleccionada no está vigente para este tipo de vehículo')
      }
    }

    const { serie, folio } = asignarSiguienteFolio(db, input.estacionamientoId)
    const horaEntrada = new Date().toISOString()

    const resultado = db
      .prepare(
        `INSERT INTO boletos
          (estacionamiento_id, serie, folio, tipo_vehiculo_id, tarifa_progresiva_id, tarifa_plana_id, placa, hora_entrada, usuario_emision_id)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        input.estacionamientoId,
        serie,
        folio,
        input.tipoVehiculoId,
        tarifa.id,
        input.tarifaPlanaId ?? null,
        input.placa ?? null,
        horaEntrada,
        input.usuarioEmisionId
      )

    return {
      id: resultado.lastInsertRowid as number,
      serie,
      folio,
      tipoVehiculoId: input.tipoVehiculoId,
      horaEntrada,
      tarifaPlanaId: input.tarifaPlanaId ?? null
    }
  })

  return transaccion()
}

export interface BoletoListado {
  id: number
  serie: string
  folio: number
  tipoVehiculo: string
  placa: string | null
  horaEntrada: string
  estado: string
}

export function listarBoletosAbiertos(db: DB, estacionamientoId: number): BoletoListado[] {
  return db
    .prepare<[number], BoletoListado>(
      `SELECT b.id, b.serie, b.folio, tv.nombre AS tipoVehiculo, b.placa, b.hora_entrada AS horaEntrada, b.estado
       FROM boletos b
       JOIN tipos_vehiculo tv ON tv.id = b.tipo_vehiculo_id
       WHERE b.estacionamiento_id = ? AND b.estado = 'abierto'
       ORDER BY b.id DESC
       LIMIT 50`
    )
    .all(estacionamientoId)
}

/** Busca un boleto abierto por serie+folio (lo que trae el código de barras escaneado). */
export function buscarBoletoAbiertoPorFolio(
  db: DB,
  estacionamientoId: number,
  serie: string,
  folio: number
): BoletoListado | null {
  const fila = db
    .prepare<[number, string, number], BoletoListado>(
      `SELECT b.id, b.serie, b.folio, tv.nombre AS tipoVehiculo, b.placa, b.hora_entrada AS horaEntrada, b.estado
       FROM boletos b
       JOIN tipos_vehiculo tv ON tv.id = b.tipo_vehiculo_id
       WHERE b.estacionamiento_id = ? AND b.serie = ? AND b.folio = ? AND b.estado = 'abierto'`
    )
    .get(estacionamientoId, serie, folio)

  return fila ?? null
}

export interface CierreBoletoInput {
  boletoId: number
  usuarioCobroId: number
}

export interface BoletoCerrado {
  id: number
  serie: string
  folio: number
  horaSalida: string
  minutosTotales: number
  tipoCobro: 'regular' | 'plana'
  monto: number
  excedenteMinutos?: number
  excedenteMonto?: number
  recargoBoletoPerdido?: number
}

interface BoletoRow {
  id: number
  serie: string
  folio: number
  estado: string
  estacionamiento_id: number
  hora_entrada: string
  tarifa_progresiva_id: number
  tarifa_plana_id: number | null
}

function obtenerBoletoAbierto(db: DB, boletoId: number): BoletoRow {
  const boleto = db
    .prepare<[number], BoletoRow>(
      `SELECT id, serie, folio, estado, estacionamiento_id, hora_entrada, tarifa_progresiva_id, tarifa_plana_id
       FROM boletos WHERE id = ?`
    )
    .get(boletoId)

  if (!boleto) {
    throw new Error(`No existe el boleto ${boletoId}`)
  }
  if (boleto.estado !== 'abierto') {
    throw new Error(`El boleto ${boleto.serie}-${boleto.folio} ya está ${boleto.estado}`)
  }
  return boleto
}

function calcularDetalleCobro(db: DB, boleto: BoletoRow, horaSalida: Date) {
  const tarifaRegular = obtenerTarifaProgresiva(db, boleto.tarifa_progresiva_id)
  const tarifaPlana = boleto.tarifa_plana_id ? obtenerTarifaPlana(db, boleto.tarifa_plana_id) : null
  const horaEntrada = new Date(boleto.hora_entrada)
  return calcularCobro(horaEntrada, horaSalida, tarifaRegular, tarifaPlana)
}

/**
 * Cierra un boleto abierto: calcula el cobro con el motor de tarifas (usando
 * la tarifa progresiva/plana que quedó fija al emitir, ver emitirBoleto) y
 * marca hora_salida + monto_cobrado. Todo en una transacción.
 */
export function cerrarBoleto(db: DB, input: CierreBoletoInput): BoletoCerrado {
  const transaccion = db.transaction((): BoletoCerrado => {
    const boleto = obtenerBoletoAbierto(db, input.boletoId)
    const horaSalida = new Date()
    const detalle = calcularDetalleCobro(db, boleto, horaSalida)

    db.prepare(
      `UPDATE boletos
       SET hora_salida = ?, minutos_totales = ?, monto_cobrado = ?, excedente_minutos = ?, excedente_monto = ?,
           estado = 'cerrado', usuario_cobro_id = ?
       WHERE id = ?`
    ).run(
      horaSalida.toISOString(),
      detalle.minutosTotales,
      detalle.monto,
      detalle.excedenteMinutos ?? null,
      detalle.excedenteMonto ?? null,
      input.usuarioCobroId,
      boleto.id
    )

    return {
      id: boleto.id,
      serie: boleto.serie,
      folio: boleto.folio,
      horaSalida: horaSalida.toISOString(),
      minutosTotales: detalle.minutosTotales,
      tipoCobro: detalle.tipoCobro,
      monto: detalle.monto,
      excedenteMinutos: detalle.excedenteMinutos,
      excedenteMonto: detalle.excedenteMonto
    }
  })

  return transaccion()
}

/**
 * Cierra un boleto perdido: igual que cerrarBoleto, pero suma el cargo fijo
 * configurado (estacionamientos.cargo_boleto_perdido) al cobro normal y
 * marca boleto_perdido/recargo_boleto_perdido para dejar rastro de que fue
 * una excepción — el monto se configura en Admin, pestaña "Estacionamiento"
 * (ver actualizarCargoBoletoPerdido en src/db/estacionamientos.ts).
 */
export function cerrarBoletoPerdido(db: DB, input: CierreBoletoInput): BoletoCerrado {
  const transaccion = db.transaction((): BoletoCerrado => {
    const boleto = obtenerBoletoAbierto(db, input.boletoId)
    const horaSalida = new Date()
    const detalle = calcularDetalleCobro(db, boleto, horaSalida)

    const fila = db
      .prepare<[number], { cargo_boleto_perdido: number }>('SELECT cargo_boleto_perdido FROM estacionamientos WHERE id = ?')
      .get(boleto.estacionamiento_id)
    const recargo = fila?.cargo_boleto_perdido ?? 0
    const montoTotal = detalle.monto + recargo

    db.prepare(
      `UPDATE boletos
       SET hora_salida = ?, minutos_totales = ?, monto_cobrado = ?, excedente_minutos = ?, excedente_monto = ?,
           estado = 'cerrado', usuario_cobro_id = ?, boleto_perdido = 1, recargo_boleto_perdido = ?
       WHERE id = ?`
    ).run(
      horaSalida.toISOString(),
      detalle.minutosTotales,
      montoTotal,
      detalle.excedenteMinutos ?? null,
      detalle.excedenteMonto ?? null,
      input.usuarioCobroId,
      recargo,
      boleto.id
    )

    return {
      id: boleto.id,
      serie: boleto.serie,
      folio: boleto.folio,
      horaSalida: horaSalida.toISOString(),
      minutosTotales: detalle.minutosTotales,
      tipoCobro: detalle.tipoCobro,
      monto: montoTotal,
      excedenteMinutos: detalle.excedenteMinutos,
      excedenteMonto: detalle.excedenteMonto,
      recargoBoletoPerdido: recargo
    }
  })

  return transaccion()
}

export interface CobroPorFolioInput {
  estacionamientoId: number
  serie: string
  folio: number
  usuarioCobroId: number
}

function buscarBoletoPorFolioCualquierEstado(
  db: DB,
  estacionamientoId: number,
  serie: string,
  folio: number
): { id: number; estado: string } | null {
  const fila = db
    .prepare<[number, string, number], { id: number; estado: string }>(
      'SELECT id, estado FROM boletos WHERE estacionamiento_id = ? AND serie = ? AND folio = ?'
    )
    .get(estacionamientoId, serie, folio)
  return fila ?? null
}

/**
 * Deja rastro de que alguien volvió a escanear un boleto que ya no está
 * abierto — no bloquea el escaneo (solo se le informa al operador), pero
 * queda registrado para poder revisar el patrón después (folios que se
 * reescanean seguido, o siempre el mismo usuario) desde intentos_recobro.
 */
function registrarIntentoRecobro(db: DB, boletoId: number, usuarioId: number): void {
  db.prepare('INSERT INTO intentos_recobro (boleto_id, usuario_id) VALUES (?, ?)').run(boletoId, usuarioId)
}

/** Cobra directamente por serie+folio (lo que entrega el escáner en la salida). */
export function cobrarBoletoPorFolio(db: DB, input: CobroPorFolioInput): BoletoCerrado {
  const boleto = buscarBoletoAbiertoPorFolio(db, input.estacionamientoId, input.serie, input.folio)
  if (boleto) {
    return cerrarBoleto(db, { boletoId: boleto.id, usuarioCobroId: input.usuarioCobroId })
  }

  const existente = buscarBoletoPorFolioCualquierEstado(db, input.estacionamientoId, input.serie, input.folio)
  if (existente) {
    if (existente.estado === 'cerrado') {
      registrarIntentoRecobro(db, existente.id, input.usuarioCobroId)
      throw new Error(`Este boleto (${input.serie}-${input.folio}) ya fue cobrado antes.`)
    }
    throw new Error(`Este boleto (${input.serie}-${input.folio}) está cancelado.`)
  }

  throw new Error(`No existe ningún boleto con folio ${input.serie}-${input.folio} en este estacionamiento.`)
}

export interface Resumen {
  entradasDesdeUltimoCorte: number
  actualmenteDentro: number
}

/**
 * entradasDesdeUltimoCorte: boletos con hora_entrada después del último
 * corte (o desde que se creó el estacionamiento, si nunca se ha hecho uno).
 * Se reinicia solo al generar un corte — no es por día calendario.
 * actualmenteDentro: boletos con estado 'abierto' ahora mismo (sin importar
 * cuándo entraron) — es el conteo real de ocupación, no se reinicia con el
 * corte porque un vehículo puede seguir dentro entre un corte y el siguiente.
 */
export function obtenerResumen(db: DB, estacionamientoId: number): Resumen {
  const desde = obtenerInicioPeriodoActual(db, estacionamientoId)

  const { n: entradasDesdeUltimoCorte } = db
    .prepare<[number, string], { n: number }>(
      'SELECT COUNT(*) AS n FROM boletos WHERE estacionamiento_id = ? AND hora_entrada > ?'
    )
    .get(estacionamientoId, desde)!

  const { n: actualmenteDentro } = db
    .prepare<[number], { n: number }>(
      "SELECT COUNT(*) AS n FROM boletos WHERE estacionamiento_id = ? AND estado = 'abierto'"
    )
    .get(estacionamientoId)!

  return { entradasDesdeUltimoCorte, actualmenteDentro }
}

/**
 * Motor de cálculo de tarifas — Sistema de estacionamientos
 * ============================================================
 *
 * Reglas implementadas (traducidas 1:1 desde motor_tarifas.py):
 * 1. Tarifa progresiva incremental por bloques de 15 min, hasta 24 bloques (6h).
 *    Cada bloque tiene su propio precio incremental (se van sumando).
 * 2. Después del bloque 24, se repite el incremental del último bloque configurado.
 * 3. Tope máximo por ciclo de 24 horas corridas desde la hora de entrada
 *    (no día calendario). Al llegar a las 24h, se reinicia el ciclo.
 * 4. Tarifa plana: se ofrece y decide AL EMITIR el boleto (no al cobrar).
 *    Si el tiempo transcurrido excede las horas incluidas, se cobra
 *    precioFijo + excedente calculado con la tarifa regular progresiva.
 */

export const MINUTOS_POR_BLOQUE = 15
export const BLOQUES_CONFIGURABLES = 24 // 24 bloques de 15 min = 6 horas
export const MINUTOS_POR_CICLO = 24 * 60 // tope se aplica por ciclos de 24h

/** Precios incrementales por bloque de 15 min, para un tipo de vehículo
 * en un estacionamiento específico. Índice 0 = bloque 1 (primeros 15 min). */
export interface TarifaProgresiva {
  preciosPorBloque: number[] // longitud BLOQUES_CONFIGURABLES, en blanco = 0
  tarifaMaximaDiaria: number // tope por ciclo de 24h (0 = sin tope)
}

export interface TarifaPlana {
  precioFijo: number
  horasIncluidas: number
}

export interface DetalleCobro {
  minutosTotales: number
  tipoCobro: 'plana' | 'regular'
  monto: number
  excedenteMinutos?: number
  excedenteMonto?: number
}

/** Precio incremental del bloque N (1-indexed). Después del bloque 24
 * se repite el precio del último bloque configurado. */
function precioBloque(tarifa: TarifaProgresiva, numeroBloque1Indexed: number): number {
  if (numeroBloque1Indexed <= BLOQUES_CONFIGURABLES) {
    return tarifa.preciosPorBloque[numeroBloque1Indexed - 1]
  }
  return tarifa.preciosPorBloque[BLOQUES_CONFIGURABLES - 1]
}

/** Redondea minutos hacia arriba a número de bloques de 15 min.
 * 0 minutos = 0 bloques (no se cobra si sale inmediatamente). */
function bloquesEn(minutos: number): number {
  if (minutos <= 0) return 0
  return Math.ceil(minutos / MINUTOS_POR_BLOQUE)
}

function redondear(monto: number): number {
  return Math.round((monto + Number.EPSILON) * 100) / 100
}

/** Calcula el cobro por tarifa regular progresiva, respetando el tope
 * máximo por cada ciclo de 24 horas. */
export function calcularRegular(minutosTotales: number, tarifa: TarifaProgresiva): number {
  let total = 0
  let minutosRestantes = minutosTotales

  while (minutosRestantes > 0) {
    const minutosEsteCiclo = Math.min(minutosRestantes, MINUTOS_POR_CICLO)
    const bloques = bloquesEn(minutosEsteCiclo)

    let acumuladoCiclo = 0
    for (let b = 1; b <= bloques; b++) {
      acumuladoCiclo += precioBloque(tarifa, b)
      if (tarifa.tarifaMaximaDiaria > 0 && acumuladoCiclo >= tarifa.tarifaMaximaDiaria) {
        acumuladoCiclo = tarifa.tarifaMaximaDiaria
        break
      }
    }

    total += acumuladoCiclo
    minutosRestantes -= minutosEsteCiclo
  }

  return total
}

/**
 * Función principal: calcula el monto a cobrar.
 *
 * Si tarifaPlana es undefined/null -> el boleto se emitió como regular.
 * Si tarifaPlana tiene valor -> el boleto se emitió con tarifa plana
 * aceptada por el cliente al entrar; se cobra fijo + excedente si aplica.
 */
export function calcularCobro(
  horaEntrada: Date,
  horaSalida: Date,
  tarifaRegular: TarifaProgresiva,
  tarifaPlana?: TarifaPlana | null
): DetalleCobro {
  const minutosTotales = Math.floor((horaSalida.getTime() - horaEntrada.getTime()) / 1000 / 60)
  if (minutosTotales < 0) {
    throw new Error('horaSalida no puede ser anterior a horaEntrada')
  }

  if (!tarifaPlana) {
    const monto = calcularRegular(minutosTotales, tarifaRegular)
    return {
      minutosTotales,
      tipoCobro: 'regular',
      monto: redondear(monto)
    }
  }

  const minutosIncluidos = Math.floor(tarifaPlana.horasIncluidas * 60)
  if (minutosTotales <= minutosIncluidos) {
    return {
      minutosTotales,
      tipoCobro: 'plana',
      monto: redondear(tarifaPlana.precioFijo),
      excedenteMinutos: 0,
      excedenteMonto: 0
    }
  }

  const minutosExcedente = minutosTotales - minutosIncluidos
  const montoExcedente = calcularRegular(minutosExcedente, tarifaRegular)

  return {
    minutosTotales,
    tipoCobro: 'plana',
    monto: redondear(tarifaPlana.precioFijo + montoExcedente),
    excedenteMinutos: minutosExcedente,
    excedenteMonto: redondear(montoExcedente)
  }
}

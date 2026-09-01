import type { DB } from './index'
import { Corte, listarCortesEnRango } from './cortes'
import {
  obtenerResumenPensionadosPeriodo,
  PagoPensionadoEnPeriodo,
  EventoPensionadoEnPeriodo
} from './pensionados'
import { obtenerResumenGastosPeriodo, ResumenGastosPorCategoria } from './gastos'

export interface CorteMensual {
  anio: number
  mes: number
  desde: string
  hasta: string
  totalBoletos: number
  totalMonto: number
  pensionadosPagosCantidad: number
  pensionadosPagosMonto: number
  pagosPensionados: PagoPensionadoEnPeriodo[]
  altasPensionados: EventoPensionadoEnPeriodo[]
  bajasPensionados: EventoPensionadoEnPeriodo[]
  gastosEfectivoCantidad: number
  gastosEfectivoMonto: number
  gastosPorCategoria: ResumenGastosPorCategoria[]
  totalEnCaja: number
  cortesDelMes: Corte[]
}

/**
 * Rango del mes calendario en el mismo estilo (desde, hasta] que ya usan
 * los cortes de turno: desde = último instante del mes anterior, hasta =
 * último instante de este mes — así un boleto/pago/gasto justo a la
 * medianoche del día 1 cae del lado correcto sin tener que inventar una
 * convención de rango distinta a la que ya usa el resto de la app.
 */
function obtenerRangoMes(anio: number, mes: number): { desde: string; hasta: string } {
  const inicioMes = Date.UTC(anio, mes - 1, 1, 0, 0, 0, 0)
  const inicioMesSiguiente = Date.UTC(mes === 12 ? anio + 1 : anio, mes === 12 ? 0 : mes, 1, 0, 0, 0, 0)
  return {
    desde: new Date(inicioMes - 1).toISOString(),
    hasta: new Date(inicioMesSiguiente - 1).toISOString()
  }
}

/**
 * Se calcula siempre fresco a partir de los datos crudos (boletos,
 * pensionados_pagos, gastos) del mes calendario — no se guarda ni depende
 * de que los cortes de turno del mes alineen exacto con su límite.
 * `cortesDelMes` se incluye solo como referencia/auditoría (para ver qué
 * cortes de turno ya se hicieron ese mes), no se usa para sumar el total.
 */
export function obtenerCorteMensual(db: DB, estacionamientoId: number, anio: number, mes: number): CorteMensual {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error('El mes debe ser un entero entre 1 y 12')
  }

  const { desde, hasta } = obtenerRangoMes(anio, mes)

  const { n, total } = db
    .prepare<[number, string, string], { n: number; total: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(monto_cobrado), 0) AS total
       FROM boletos
       WHERE estacionamiento_id = ? AND estado = 'cerrado' AND hora_salida > ? AND hora_salida <= ?`
    )
    .get(estacionamientoId, desde, hasta)!

  const resumenPensionados = obtenerResumenPensionadosPeriodo(db, estacionamientoId, desde, hasta)
  const resumenGastos = obtenerResumenGastosPeriodo(db, estacionamientoId, desde, hasta)
  const cortesDelMes = listarCortesEnRango(db, estacionamientoId, desde, hasta)

  return {
    anio,
    mes,
    desde,
    hasta,
    totalBoletos: n,
    totalMonto: total,
    pensionadosPagosCantidad: resumenPensionados.pagosCantidad,
    pensionadosPagosMonto: resumenPensionados.pagosMonto,
    pagosPensionados: resumenPensionados.pagos,
    altasPensionados: resumenPensionados.altas,
    bajasPensionados: resumenPensionados.bajas,
    gastosEfectivoCantidad: resumenGastos.efectivoCantidad,
    gastosEfectivoMonto: resumenGastos.efectivoMonto,
    gastosPorCategoria: resumenGastos.porCategoria,
    totalEnCaja: total + resumenPensionados.pagosMonto - resumenGastos.efectivoMonto,
    cortesDelMes
  }
}

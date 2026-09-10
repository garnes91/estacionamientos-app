import type { DB } from './index'
import { obtenerCorteMensual } from './corteMensual'

export interface ResultadoMensual {
  anio: number
  mes: number
  totalBoletos: number
  montoBoletos: number
  montoPensionados: number
  ingresos: number
  // Todos los gastos del mes, sin importar forma de pago — a diferencia de
  // gastosEfectivoMonto de Corte Mensual (que solo resta lo que sale de la
  // caja física), este es el egreso real del negocio para un estado de
  // resultados simplificado.
  egresos: number
  resultadoNeto: number
}

/**
 * Últimos `meses` meses calendario (incluye el actual), en orden
 * cronológico ascendente — el último elemento siempre es el mes en curso.
 * Reutiliza obtenerCorteMensual mes por mes en vez de reimplementar el
 * rango de "mes calendario": así el comparativo nunca se puede desalinear
 * de lo que ya muestra Corte Mensual para ese mismo mes.
 *
 * "Mes actual" se calcula con hora LOCAL (igual que CorteMensual.tsx elige
 * su mes por default) — aunque el rango interno de cada mes se calcule en
 * UTC (ver obtenerRangoMes en corteMensual.ts), es la misma mezcla que ya
 * usa el resto de la app.
 */
export function obtenerIngresosPorMes(
  db: DB,
  estacionamientoId: number,
  meses = 13,
  referencia = new Date()
): ResultadoMensual[] {
  if (!Number.isInteger(meses) || meses < 1) {
    throw new Error('meses debe ser un entero de al menos 1')
  }

  let anio = referencia.getFullYear()
  let mes = referencia.getMonth() + 1

  const resultado: ResultadoMensual[] = []
  for (let i = 0; i < meses; i++) {
    const corte = obtenerCorteMensual(db, estacionamientoId, anio, mes)
    const ingresos = corte.totalMonto + corte.pensionadosPagosMonto
    const egresos = corte.gastosPorCategoria.reduce((acc, g) => acc + g.monto, 0)
    resultado.push({
      anio,
      mes,
      totalBoletos: corte.totalBoletos,
      montoBoletos: corte.totalMonto,
      montoPensionados: corte.pensionadosPagosMonto,
      ingresos,
      egresos,
      resultadoNeto: ingresos - egresos
    })

    mes -= 1
    if (mes === 0) {
      mes = 12
      anio -= 1
    }
  }

  return resultado.reverse()
}

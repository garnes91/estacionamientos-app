/**
 * Reparto round-robin ponderado entre series de folio (ej. A:B = 3:1, 5:2).
 *
 * Algoritmo: en cada llamada se elige la serie activa con menor razón
 * contadorEmitidos / proporcion — es decir, la que va más "atrasada"
 * respecto a la cuota que le toca según su peso configurado. Esto reparte
 * el flujo de boletos de forma pareja (no en bloques "todos los A primero"),
 * es determinista y no requiere estado adicional: contadorEmitidos ya vive
 * en series_folio, así que el reparto se autocorrige solo tras un reinicio
 * de la app o si una serie estuvo inactiva un tiempo.
 *
 * Desempate: si dos series tienen exactamente la misma razón (típicamente
 * al arrancar, ambas en 0), gana la de mayor proporcion; si siguen
 * empatadas, gana la que aparece primero en el arreglo de entrada.
 */

export interface SerieFolioEstado {
  id: number
  serie: string
  proporcion: number
  contadorEmitidos: number
  activo: boolean
}

export function elegirSiguienteSerie(series: SerieFolioEstado[]): SerieFolioEstado {
  const activas = series.filter((s) => s.activo)
  if (activas.length === 0) {
    throw new Error('No hay series de folio activas')
  }

  let elegida = activas[0]
  let mejorRazon = elegida.contadorEmitidos / elegida.proporcion

  for (let i = 1; i < activas.length; i++) {
    const candidata = activas[i]
    const razon = candidata.contadorEmitidos / candidata.proporcion

    if (razon < mejorRazon || (razon === mejorRazon && candidata.proporcion > elegida.proporcion)) {
      elegida = candidata
      mejorRazon = razon
    }
  }

  return elegida
}

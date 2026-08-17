import { describe, expect, it } from 'vitest'
import { elegirSiguienteSerie, SerieFolioEstado } from './reparteSeries'

function simular(estadoInicial: SerieFolioEstado[], emisiones: number): string[] {
  const estado = estadoInicial.map((s) => ({ ...s }))
  const secuencia: string[] = []

  for (let i = 0; i < emisiones; i++) {
    const elegida = elegirSiguienteSerie(estado)
    secuencia.push(elegida.serie)
    const fila = estado.find((s) => s.id === elegida.id)!
    fila.contadorEmitidos += 1
  }

  return secuencia
}

describe('elegirSiguienteSerie', () => {
  it('reparte 3:1 exactamente en proporción tras un ciclo completo', () => {
    const series: SerieFolioEstado[] = [
      { id: 1, serie: 'A', proporcion: 3, contadorEmitidos: 0, activo: true },
      { id: 2, serie: 'B', proporcion: 1, contadorEmitidos: 0, activo: true }
    ]

    const secuencia = simular(series, 8)
    const conteoA = secuencia.filter((s) => s === 'A').length
    const conteoB = secuencia.filter((s) => s === 'B').length

    expect(conteoA).toBe(6)
    expect(conteoB).toBe(2)
  })

  it('reparte 5:2 exactamente en proporción tras un ciclo completo', () => {
    const series: SerieFolioEstado[] = [
      { id: 1, serie: 'A', proporcion: 5, contadorEmitidos: 0, activo: true },
      { id: 2, serie: 'B', proporcion: 2, contadorEmitidos: 0, activo: true }
    ]

    const secuencia = simular(series, 21) // 3 ciclos de 7
    const conteoA = secuencia.filter((s) => s === 'A').length
    const conteoB = secuencia.filter((s) => s === 'B').length

    expect(conteoA).toBe(15)
    expect(conteoB).toBe(6)
  })

  it('no agrupa todas las emisiones de una serie al inicio (reparto intercalado)', () => {
    const series: SerieFolioEstado[] = [
      { id: 1, serie: 'A', proporcion: 3, contadorEmitidos: 0, activo: true },
      { id: 2, serie: 'B', proporcion: 1, contadorEmitidos: 0, activo: true }
    ]

    const secuencia = simular(series, 8)
    // Con 3:1 nunca deberían caer más de 3 "A" seguidas antes de una "B".
    let rachaA = 0
    for (const serie of secuencia) {
      if (serie === 'A') {
        rachaA += 1
        expect(rachaA).toBeLessThanOrEqual(3)
      } else {
        rachaA = 0
      }
    }
  })

  it('ignora series inactivas', () => {
    const series: SerieFolioEstado[] = [
      { id: 1, serie: 'A', proporcion: 1, contadorEmitidos: 0, activo: true },
      { id: 2, serie: 'C', proporcion: 999, contadorEmitidos: 0, activo: false }
    ]

    const secuencia = simular(series, 5)
    expect(secuencia.every((s) => s === 'A')).toBe(true)
  })

  it('lanza error si no hay series activas', () => {
    const series: SerieFolioEstado[] = [
      { id: 1, serie: 'A', proporcion: 1, contadorEmitidos: 0, activo: false }
    ]

    expect(() => elegirSiguienteSerie(series)).toThrow('No hay series de folio activas')
  })

  it('en empate total, favorece la de mayor proporción', () => {
    const series: SerieFolioEstado[] = [
      { id: 1, serie: 'B', proporcion: 1, contadorEmitidos: 0, activo: true },
      { id: 2, serie: 'A', proporcion: 3, contadorEmitidos: 0, activo: true }
    ]

    expect(elegirSiguienteSerie(series).serie).toBe('A')
  })
})

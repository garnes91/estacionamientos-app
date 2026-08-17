import { describe, expect, it } from 'vitest'
import { BLOQUES_CONFIGURABLES, calcularCobro, TarifaPlana, TarifaProgresiva } from './motorTarifas'

// Misma tarifa de ejemplo que motor_tarifas.py:
// $10 por bloque los primeros 4 bloques (1h), luego $15 por bloque hasta
// el bloque 24, tope diario $300.
const precios = [
  ...Array(4).fill(10),
  ...Array(BLOQUES_CONFIGURABLES - 4).fill(15)
]
const tarifaRegular: TarifaProgresiva = {
  preciosPorBloque: precios,
  tarifaMaximaDiaria: 300
}

const entrada = new Date(2026, 7, 15, 10, 0) // 15 ago 2026, 10:00

function horasDespues(fecha: Date, horas: number, minutos = 0): Date {
  return new Date(fecha.getTime() + (horas * 60 + minutos) * 60 * 1000)
}

describe('calcularCobro — tarifa regular', () => {
  it('Caso 1: 4 bloques exactos (1h) -> $40', () => {
    const salida = horasDespues(entrada, 1)
    const r = calcularCobro(entrada, salida, tarifaRegular)
    expect(r.monto).toBe(40)
  })

  it('Caso 2: 1h 5min (entra al bloque 5, $15 extra) -> $55', () => {
    const salida = horasDespues(entrada, 1, 5)
    const r = calcularCobro(entrada, salida, tarifaRegular)
    expect(r.monto).toBe(55)
  })

  it('Caso 3: tope diario alcanzado (20h) -> $300', () => {
    const salida = horasDespues(entrada, 20)
    const r = calcularCobro(entrada, salida, tarifaRegular)
    expect(r.monto).toBe(300)
  })

  it('Caso 4: 30 horas (cruza el ciclo de 24h) -> tope x2 ciclos = $600', () => {
    const salida = horasDespues(entrada, 30)
    const r = calcularCobro(entrada, salida, tarifaRegular)
    // 24h tope $300 + 6h adicionales también topan a $300
    expect(r.monto).toBe(600)
  })
})

describe('calcularCobro — tarifa plana', () => {
  const planaOcho: TarifaPlana = { precioFijo: 80, horasIncluidas: 8 }
  const entrada2 = new Date(2026, 7, 15, 9, 0)

  it('Caso 5: plana $80 por 8h, se queda 9h -> $120', () => {
    const salida2 = horasDespues(entrada2, 9)
    const r = calcularCobro(entrada2, salida2, tarifaRegular, planaOcho)
    // 1h de excedente = 4 bloques a $10 = $40 -> total $120
    expect(r.monto).toBe(120)
  })

  it('Caso 6: plana $80 por 8h, sale a las 7h50 (dentro del tiempo) -> $80', () => {
    const salida3 = horasDespues(entrada2, 7, 50)
    const r = calcularCobro(entrada2, salida3, tarifaRegular, planaOcho)
    expect(r.monto).toBe(80)
  })
})

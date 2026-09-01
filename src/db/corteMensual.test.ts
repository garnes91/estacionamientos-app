import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerUsuarioPorDefecto } from './usuarios'
import { listarTiposVehiculo } from './tiposVehiculo'
import { cerrarBoleto, emitirBoleto } from './boletos'
import { crearPensionado, registrarPago } from './pensionados'
import { registrarGasto } from './gastos'
import { hacerCorte } from './cortes'
import { obtenerCorteMensual } from './corteMensual'

let db: DB
let estacionamientoId: number
let usuarioId: number
let tipoAutoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
  usuarioId = obtenerUsuarioPorDefecto(db, estacionamientoId).id
  tipoAutoId = listarTiposVehiculo(db, estacionamientoId).find((t) => t.nombre === 'Auto')!.id
})

function cerrarBoletoConFecha(horaSalida: string, monto = 40): void {
  const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
  const cierre = cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
  db.prepare('UPDATE boletos SET hora_salida = ?, monto_cobrado = ? WHERE id = ?').run(horaSalida, monto, cierre.id)
}

describe('obtenerCorteMensual', () => {
  it('en cero si no hay nada ese mes', () => {
    const corte = obtenerCorteMensual(db, estacionamientoId, 2026, 6)
    expect(corte.totalBoletos).toBe(0)
    expect(corte.totalMonto).toBe(0)
    expect(corte.totalEnCaja).toBe(0)
  })

  it('rechaza un mes fuera de 1-12', () => {
    expect(() => obtenerCorteMensual(db, estacionamientoId, 2026, 13)).toThrow('entre 1 y 12')
    expect(() => obtenerCorteMensual(db, estacionamientoId, 2026, 0)).toThrow('entre 1 y 12')
  })

  it('suma los boletos cerrados dentro del mes calendario, sin importar los cortes de turno que haya', () => {
    cerrarBoletoConFecha('2026-06-05T10:00:00.000Z', 40)
    cerrarBoletoConFecha('2026-06-20T10:00:00.000Z', 40)
    // Fuera del mes: no debe contar.
    cerrarBoletoConFecha('2026-05-31T23:59:59.000Z', 999)
    cerrarBoletoConFecha('2026-07-01T00:00:01.000Z', 999)

    const corte = obtenerCorteMensual(db, estacionamientoId, 2026, 6)
    expect(corte.totalBoletos).toBe(2)
    expect(corte.totalMonto).toBe(80)
  })

  it('incluye pagos de pensionados y gastos en efectivo del mes, y calcula el total en caja', () => {
    const pensionado = crearPensionado(db, {
      estacionamientoId,
      nombre: 'Ana',
      tipoVehiculoId: tipoAutoId,
      cuotaMensual: 800,
      usuarioAltaId: usuarioId
    })
    registrarPago(db, {
      pensionadoId: pensionado.id,
      periodoDesde: '2026-06-01T00:00:00.000Z',
      periodoHasta: '2026-07-01T00:00:00.000Z',
      monto: 800,
      usuarioId
    })
    db.prepare('UPDATE pensionados_pagos SET created_at = ? WHERE pensionado_id = ?').run(
      '2026-06-10T00:00:00.000Z',
      pensionado.id
    )

    registrarGasto(db, {
      estacionamientoId,
      concepto: 'Escoba',
      categoria: 'operativo',
      monto: 150,
      formaPago: 'efectivo',
      fecha: '2026-06-15T00:00:00.000Z',
      usuarioId
    })
    registrarGasto(db, {
      estacionamientoId,
      concepto: 'Nómina',
      categoria: 'nomina',
      monto: 5000,
      formaPago: 'transferencia',
      fecha: '2026-06-15T00:00:00.000Z',
      usuarioId
    })

    const corte = obtenerCorteMensual(db, estacionamientoId, 2026, 6)
    expect(corte.pensionadosPagosMonto).toBe(800)
    expect(corte.gastosEfectivoMonto).toBe(150) // solo el de efectivo
    expect(corte.gastosPorCategoria.find((c) => c.categoria === 'nomina')?.monto).toBe(5000) // pero sí aparece en el desglose
    expect(corte.totalEnCaja).toBe(0 + 800 - 150)
  })

  it('lista los cortes de turno del mes como referencia, sin usarlos para sumar', async () => {
    cerrarBoletoConFecha(new Date().toISOString(), 40)
    const corteTurno = hacerCorte(db, estacionamientoId, usuarioId)

    const ahora = new Date()
    const corteMensual = obtenerCorteMensual(db, estacionamientoId, ahora.getFullYear(), ahora.getMonth() + 1)

    expect(corteMensual.cortesDelMes.map((c) => c.id)).toContain(corteTurno.id)
  })
})

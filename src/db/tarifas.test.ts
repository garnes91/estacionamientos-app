import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerUsuarioPorDefecto } from './usuarios'
import { listarTiposVehiculo } from './tiposVehiculo'
import { cerrarBoleto, emitirBoleto } from './boletos'
import { actualizarTarifaProgresiva, obtenerTarifaProgresivaActivaPorTipo } from './tarifas'
import { BLOQUES_CONFIGURABLES } from '../logic/motorTarifas'

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

function backdatar(boletoId: number, minutosAtras: number): void {
  const horaEntrada = new Date(Date.now() - minutosAtras * 60 * 1000).toISOString()
  db.prepare('UPDATE boletos SET hora_entrada = ? WHERE id = ?').run(horaEntrada, boletoId)
}

describe('obtenerTarifaProgresivaActivaPorTipo', () => {
  it('devuelve la tarifa sembrada de Auto con sus 24 bloques', () => {
    const tarifa = obtenerTarifaProgresivaActivaPorTipo(db, tipoAutoId)
    expect(tarifa?.preciosPorBloque).toHaveLength(BLOQUES_CONFIGURABLES)
    expect(tarifa?.tarifaMaximaDiaria).toBe(300)
  })

  it('devuelve null si el tipo no tiene tarifa vigente', () => {
    expect(obtenerTarifaProgresivaActivaPorTipo(db, 9999)).toBeNull()
  })
})

describe('actualizarTarifaProgresiva', () => {
  it('rechaza un arreglo de precios con longitud distinta a BLOQUES_CONFIGURABLES', () => {
    expect(() =>
      actualizarTarifaProgresiva(db, {
        estacionamientoId,
        tipoVehiculoId: tipoAutoId,
        tarifaMaximaDiaria: 300,
        preciosPorBloque: [10, 10]
      })
    ).toThrow('Se esperaban 24 precios de bloque')
  })

  it('la nueva tarifa queda vigente y se refleja en obtenerTarifaProgresivaActivaPorTipo', () => {
    const nuevosPrecios = Array(BLOQUES_CONFIGURABLES).fill(20)
    actualizarTarifaProgresiva(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      tarifaMaximaDiaria: 500,
      preciosPorBloque: nuevosPrecios
    })

    const tarifa = obtenerTarifaProgresivaActivaPorTipo(db, tipoAutoId)
    expect(tarifa?.tarifaMaximaDiaria).toBe(500)
    expect(tarifa?.preciosPorBloque[0]).toBe(20)
  })

  it('no altera el cobro de un boleto ya abierto con la tarifa anterior (snapshot)', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(emitido.id, 60) // 1h -> $40 con la tarifa sembrada (4x$10)

    actualizarTarifaProgresiva(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      tarifaMaximaDiaria: 999,
      preciosPorBloque: Array(BLOQUES_CONFIGURABLES).fill(1000) // precio absurdo, no debería aplicarse
    })

    const cierre = cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
    expect(cierre.monto).toBe(40)
  })

  it('un boleto emitido después del cambio sí usa la tarifa nueva', () => {
    actualizarTarifaProgresiva(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      tarifaMaximaDiaria: 999,
      preciosPorBloque: Array(BLOQUES_CONFIGURABLES).fill(100)
    })

    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(emitido.id, 15) // 1 bloque

    const cierre = cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
    expect(cierre.monto).toBe(100)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerUsuarioPorDefecto } from './usuarios'
import { listarTiposVehiculo } from './tiposVehiculo'
import { cerrarBoleto, emitirBoleto } from './boletos'
import { hacerCorte, listarCortes, obtenerDetalleCorte } from './cortes'

let db: DB
let estacionamientoId: number
let usuarioId: number
let tipoAutoId: number
let tipoCamionetaId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
  usuarioId = obtenerUsuarioPorDefecto(db, estacionamientoId).id
  const tipos = listarTiposVehiculo(db, estacionamientoId)
  tipoAutoId = tipos.find((t) => t.nombre === 'Auto')!.id
  tipoCamionetaId = tipos.find((t) => t.nombre === 'Camioneta')!.id
})

function backdatar(boletoId: number, minutosAtras: number): void {
  const horaEntrada = new Date(Date.now() - minutosAtras * 60 * 1000).toISOString()
  db.prepare('UPDATE boletos SET hora_entrada = ? WHERE id = ?').run(horaEntrada, boletoId)
}

describe('hacerCorte', () => {
  it('en cero si no hay boletos cerrados', () => {
    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corte.totalBoletos).toBe(0)
    expect(corte.totalMonto).toBe(0)
  })

  it('suma solo los boletos cerrados, no los abiertos', () => {
    const cerrado = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(cerrado.id, 60)
    cerrarBoleto(db, { boletoId: cerrado.id, usuarioCobroId: usuarioId }) // $40

    emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId }) // queda abierto

    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corte.totalBoletos).toBe(1)
    expect(corte.totalMonto).toBe(40)
  })

  it('el siguiente corte no vuelve a contar lo ya incluido en el anterior', async () => {
    const primero = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(primero.id, 60)
    cerrarBoleto(db, { boletoId: primero.id, usuarioCobroId: usuarioId }) // $40

    const corteUno = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corteUno.totalMonto).toBe(40)

    // Separación real de reloj: dos Date.now() consecutivos sin esperar
    // pueden caer en el mismo milisegundo, y eso no debe decidir a qué
    // corte pertenece un boleto.
    await new Promise((resolve) => setTimeout(resolve, 5))

    const segundo = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(segundo.id, 30) // 2 bloques = $20
    cerrarBoleto(db, { boletoId: segundo.id, usuarioCobroId: usuarioId })

    const corteDos = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corteDos.totalBoletos).toBe(1)
    expect(corteDos.totalMonto).toBe(20)
    expect(corteDos.desde).toBe(corteUno.hasta)
  })
})

describe('listarCortes', () => {
  it('devuelve los cortes más recientes primero', () => {
    hacerCorte(db, estacionamientoId, usuarioId)
    hacerCorte(db, estacionamientoId, usuarioId)
    const cortes = listarCortes(db, estacionamientoId)
    expect(cortes).toHaveLength(2)
    expect(new Date(cortes[0].hasta).getTime()).toBeGreaterThanOrEqual(new Date(cortes[1].hasta).getTime())
  })
})

describe('obtenerDetalleCorte', () => {
  it('desglosa el monto por tipo de vehículo', () => {
    const auto = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(auto.id, 60)
    cerrarBoleto(db, { boletoId: auto.id, usuarioCobroId: usuarioId }) // Auto: $40

    const camioneta = emitirBoleto(db, {
      estacionamientoId,
      tipoVehiculoId: tipoCamionetaId,
      usuarioEmisionId: usuarioId
    })
    backdatar(camioneta.id, 60)
    cerrarBoleto(db, { boletoId: camioneta.id, usuarioCobroId: usuarioId }) // Camioneta: $48 (4x$12)

    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    const detalle = obtenerDetalleCorte(db, corte.id)

    expect(detalle.porTipoVehiculo).toEqual([
      { tipoVehiculo: 'Auto', boletos: 1, monto: 40 },
      { tipoVehiculo: 'Camioneta', boletos: 1, monto: 48 }
    ])
  })

  it('lanza error si el corte no existe', () => {
    expect(() => obtenerDetalleCorte(db, 9999)).toThrow('No existe el corte')
  })

  it('agrupa los boletos por serie con su propio subtotal, listando cada folio', () => {
    // Con proporción A=3,B=1 el reparto es A,B,A,A — nos apoyamos en la
    // serie que realmente devuelve cada emisión, sin asumir el orden.
    const emitidos = Array.from({ length: 4 }, () =>
      emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    )
    emitidos.forEach((b) => {
      backdatar(b.id, 60) // $40 cada uno
      cerrarBoleto(db, { boletoId: b.id, usuarioCobroId: usuarioId })
    })

    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    const detalle = obtenerDetalleCorte(db, corte.id)

    const seriesUsadas = [...new Set(emitidos.map((b) => b.serie))].sort()
    expect(detalle.porSerie.map((s) => s.serie)).toEqual(seriesUsadas)

    const totalBoletosEnSeries = detalle.porSerie.reduce((acc, s) => acc + s.totalBoletos, 0)
    expect(totalBoletosEnSeries).toBe(4)

    const totalMontoEnSeries = detalle.porSerie.reduce((acc, s) => acc + s.totalMonto, 0)
    expect(totalMontoEnSeries).toBe(160) // 4 x $40

    for (const serie of detalle.porSerie) {
      expect(serie.totalBoletos).toBe(serie.boletos.length)
      expect(serie.totalMonto).toBe(serie.boletos.reduce((acc, b) => acc + b.monto, 0))
      for (const boleto of serie.boletos) {
        expect(boleto.monto).toBe(40)
        expect(boleto.serie).toBe(serie.serie)
      }
    }
  })
})

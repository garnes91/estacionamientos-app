import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerUsuarioPorDefecto } from './usuarios'
import { listarTiposVehiculo } from './tiposVehiculo'
import { cerrarBoleto, emitirBoleto } from './boletos'
import { crearPensionado, darDeBajaPensionado, registrarPago } from './pensionados'
import { registrarGasto } from './gastos'
import { actualizarSerie, listarSeries } from './series'
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

function altaPensionadoEjemplo(nombre = 'Juan Pérez') {
  return crearPensionado(db, {
    estacionamientoId,
    nombre,
    tipoVehiculoId: tipoAutoId,
    cuotaMensual: 800,
    usuarioAltaId: usuarioId
  })
}

// Se fuerza serie Y folio (no solo la serie) porque, con alguna serie
// desactivada a propósito en estos tests, el reparto round-robin real
// puede asignar folios que choquen con el UNIQUE (estacionamiento, serie,
// folio) al forzar la serie después — un contador propio evita ese choque
// sin depender de cómo reparte folios src/logic/reparteSeries.ts.
let siguienteFolioForzado = 100000

function cerrarBoletoConSerie(serie: string, monto = 40): number {
  const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
  const cierre = cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
  db.prepare('UPDATE boletos SET serie = ?, folio = ?, monto_cobrado = ? WHERE id = ?').run(
    serie,
    siguienteFolioForzado++,
    monto,
    cierre.id
  )
  return cierre.id
}

function desactivarSerie(serie: string): void {
  const fila = listarSeries(db, estacionamientoId).find((s) => s.serie === serie)!
  actualizarSerie(db, { id: fila.id, proporcion: fila.proporcion, activo: false })
}

function activarSerie(serie: string): void {
  const fila = listarSeries(db, estacionamientoId).find((s) => s.serie === serie)!
  actualizarSerie(db, { id: fila.id, proporcion: fila.proporcion, activo: true })
}

function gastoEjemplo(overrides: Partial<Parameters<typeof registrarGasto>[1]> = {}) {
  return registrarGasto(db, {
    estacionamientoId,
    concepto: 'Papel higiénico',
    categoria: 'operativo',
    monto: 150,
    formaPago: 'efectivo',
    fecha: new Date().toISOString(),
    usuarioId,
    ...overrides
  })
}

describe('hacerCorte', () => {
  it('en cero si no hay boletos cerrados ni pagos de pensionados', () => {
    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corte.totalBoletos).toBe(0)
    expect(corte.totalMonto).toBe(0)
    expect(corte.pensionadosPagosCantidad).toBe(0)
    expect(corte.pensionadosPagosMonto).toBe(0)
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

  it('incluye los pagos de pensionados aparte del total de boletos', () => {
    const pensionado = altaPensionadoEjemplo()
    registrarPago(db, {
      pensionadoId: pensionado.id,
      periodoDesde: pensionado.fechaAlta,
      periodoHasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      monto: 800,
      usuarioId
    })

    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corte.pensionadosPagosCantidad).toBe(1)
    expect(corte.pensionadosPagosMonto).toBe(800)
    expect(corte.totalMonto).toBe(0) // no se mezcla con boletos
  })

  it('el siguiente corte no vuelve a contar un pago de pensionado ya incluido', async () => {
    const pensionado = altaPensionadoEjemplo()
    registrarPago(db, {
      pensionadoId: pensionado.id,
      periodoDesde: pensionado.fechaAlta,
      periodoHasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      monto: 800,
      usuarioId
    })

    const corteUno = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corteUno.pensionadosPagosMonto).toBe(800)

    await new Promise((resolve) => setTimeout(resolve, 5))

    registrarPago(db, {
      pensionadoId: pensionado.id,
      periodoDesde: corteUno.hasta,
      periodoHasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      monto: 800,
      usuarioId
    })

    const corteDos = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corteDos.pensionadosPagosCantidad).toBe(1)
    expect(corteDos.pensionadosPagosMonto).toBe(800)
  })

  it('cuenta los gastos en efectivo aparte, no mezclados con boletos ni pensionados', () => {
    gastoEjemplo({ monto: 100, formaPago: 'efectivo' })

    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corte.gastosEfectivoCantidad).toBe(1)
    expect(corte.gastosEfectivoMonto).toBe(100)
    expect(corte.totalMonto).toBe(0)
    expect(corte.pensionadosPagosMonto).toBe(0)
  })

  it('no cuenta un gasto por transferencia como efectivo', () => {
    gastoEjemplo({ monto: 5000, categoria: 'nomina', formaPago: 'transferencia' })

    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corte.gastosEfectivoCantidad).toBe(0)
    expect(corte.gastosEfectivoMonto).toBe(0)
  })

  it('una serie desactivada no se cuenta ni avanza su punto de corte', () => {
    desactivarSerie('B')
    cerrarBoletoConSerie('A', 40)
    cerrarBoletoConSerie('B', 999) // no debe contarse en este corte

    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corte.totalBoletos).toBe(1)
    expect(corte.totalMonto).toBe(40)
  })

  it('al reactivarse, la serie pendiente reporta de golpe lo que se cobró mientras estaba pausada', async () => {
    desactivarSerie('B')
    cerrarBoletoConSerie('A', 40)
    cerrarBoletoConSerie('B', 999) // se cobra mientras B sigue desactivada

    const corteUno = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corteUno.totalMonto).toBe(40) // B no cuenta todavía

    await new Promise((resolve) => setTimeout(resolve, 5))
    activarSerie('B')
    cerrarBoletoConSerie('A', 40)

    const corteDos = hacerCorte(db, estacionamientoId, usuarioId)
    // A: solo lo nuevo (40). B: lo que quedó pendiente de la ronda pasada (999), de golpe.
    expect(corteDos.totalBoletos).toBe(2)
    expect(corteDos.totalMonto).toBe(40 + 999)
  })

  it('una serie siempre activa nunca cuenta el mismo boleto dos veces, corte tras corte', async () => {
    cerrarBoletoConSerie('B', 50)
    const corteUno = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corteUno.totalMonto).toBe(50)

    await new Promise((resolve) => setTimeout(resolve, 5))

    const corteDos = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corteDos.totalBoletos).toBe(0)
    expect(corteDos.totalMonto).toBe(0)
  })

  it('transición: una serie sin historial propio cae al último corte VIEJO (sin cortes_series), no al más reciente que ya la excluía', async () => {
    // Corte "viejo", de antes de este cambio — cubría A y B por igual, sin renglones en cortes_series.
    cerrarBoletoConSerie('A', 10)
    cerrarBoletoConSerie('B', 10)
    const hastaCorteViejo = new Date().toISOString()
    db.prepare(
      `INSERT INTO cortes
         (estacionamiento_id, desde, hasta, total_boletos, total_monto,
          pensionados_pagos_cantidad, pensionados_pagos_monto, gastos_efectivo_cantidad, gastos_efectivo_monto, usuario_id)
       VALUES (?, ?, ?, 2, 20, 0, 0, 0, 0, ?)`
    ).run(estacionamientoId, new Date(Date.now() - 60 * 60 * 1000).toISOString(), hastaCorteViejo, usuarioId)

    await new Promise((resolve) => setTimeout(resolve, 5))

    // Ahora se desactiva B y se genera el primer corte "nuevo" — B queda pendiente.
    desactivarSerie('B')
    cerrarBoletoConSerie('A', 40)
    cerrarBoletoConSerie('B', 999) // cobrado mientras B está pausada, después del corte viejo

    const corteNuevo = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corteNuevo.totalBoletos).toBe(1) // solo A
    expect(corteNuevo.totalMonto).toBe(40)

    await new Promise((resolve) => setTimeout(resolve, 5))

    // Se reactiva B y se corta de nuevo: debe recuperar el 999 pendiente,
    // cayendo hasta el corte VIEJO (no hasta corteNuevo, que ya la excluía).
    activarSerie('B')
    const corteFinal = hacerCorte(db, estacionamientoId, usuarioId)
    expect(corteFinal.totalBoletos).toBe(1)
    expect(corteFinal.totalMonto).toBe(999)
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

  it('incluye los pagos de pensionados del periodo, con nombre y periodo cubierto', () => {
    const pensionado = altaPensionadoEjemplo('Ana López')
    registrarPago(db, {
      pensionadoId: pensionado.id,
      periodoDesde: pensionado.fechaAlta,
      periodoHasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      monto: 800,
      usuarioId
    })

    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    const detalle = obtenerDetalleCorte(db, corte.id)

    expect(detalle.pagosPensionados).toHaveLength(1)
    expect(detalle.pagosPensionados[0]).toMatchObject({ pensionadoNombre: 'Ana López', monto: 800 })
  })

  it('incluye altas y bajas de pensionados del periodo', () => {
    altaPensionadoEjemplo('Nueva Alta')
    const paraBaja = altaPensionadoEjemplo('Para Baja')
    darDeBajaPensionado(db, { id: paraBaja.id, usuarioBajaId: usuarioId })

    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    const detalle = obtenerDetalleCorte(db, corte.id)

    expect(detalle.altasPensionados.map((a) => a.nombre).sort()).toEqual(['Nueva Alta', 'Para Baja'])
    expect(detalle.bajasPensionados.map((b) => b.nombre)).toEqual(['Para Baja'])
  })

  it('no incluye nada de pensionados si no hubo actividad en el periodo', () => {
    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    const detalle = obtenerDetalleCorte(db, corte.id)

    expect(detalle.pagosPensionados).toEqual([])
    expect(detalle.altasPensionados).toEqual([])
    expect(detalle.bajasPensionados).toEqual([])
  })

  it('incluye todos los gastos del periodo, sin importar la forma de pago, para visibilidad completa', () => {
    gastoEjemplo({ concepto: 'Escoba', formaPago: 'efectivo' })
    gastoEjemplo({ concepto: 'Nómina julio', categoria: 'nomina', monto: 5000, formaPago: 'transferencia' })

    const corte = hacerCorte(db, estacionamientoId, usuarioId)
    const detalle = obtenerDetalleCorte(db, corte.id)

    expect(detalle.gastosDelPeriodo.map((g) => g.concepto).sort()).toEqual(['Escoba', 'Nómina julio'])
    // Pero el total en caja (gastosEfectivoMonto) solo cuenta el de efectivo.
    expect(detalle.gastosEfectivoMonto).toBe(150)
  })

  it('un corte viejo (sin renglones en cortes_series, de antes de este cambio) sigue armando el detalle con el rango compartido', () => {
    const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    cerrarBoletoConSerie('A', 40)
    const hasta = new Date().toISOString()

    // Simula un corte generado ANTES de que existiera cortes_series: se
    // inserta directo en cortes, sin ningún renglón hijo.
    const corteId = db
      .prepare(
        `INSERT INTO cortes
           (estacionamiento_id, desde, hasta, total_boletos, total_monto,
            pensionados_pagos_cantidad, pensionados_pagos_monto, gastos_efectivo_cantidad, gastos_efectivo_monto, usuario_id)
         VALUES (?,?,?,?,?,0,0,0,0,?)`
      )
      .run(estacionamientoId, desde, hasta, 1, 40, usuarioId).lastInsertRowid as number

    const detalle = obtenerDetalleCorte(db, corteId)
    expect(detalle.porSerie).toHaveLength(1)
    expect(detalle.porSerie[0]).toMatchObject({ serie: 'A', totalBoletos: 1, totalMonto: 40 })
    expect(detalle.porTipoVehiculo).toEqual([{ tipoVehiculo: 'Auto', boletos: 1, monto: 40 }])
  })
})

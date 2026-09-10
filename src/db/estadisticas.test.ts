import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerUsuarioPorDefecto } from './usuarios'
import { listarTiposVehiculo } from './tiposVehiculo'
import { cerrarBoleto, emitirBoleto } from './boletos'
import { obtenerCorteMensual } from './corteMensual'
import { registrarGasto } from './gastos'
import { obtenerIngresosPorMes } from './estadisticas'

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

describe('obtenerIngresosPorMes', () => {
  it('rechaza un número de meses menor a 1', () => {
    expect(() => obtenerIngresosPorMes(db, estacionamientoId, 0)).toThrow('al menos 1')
  })

  it('devuelve la cantidad de meses pedida, en orden cronológico ascendente terminando en el mes de referencia', () => {
    const referencia = new Date('2026-06-15T12:00:00.000Z')
    const meses = obtenerIngresosPorMes(db, estacionamientoId, 4, referencia)

    expect(meses.map((m) => `${m.anio}-${m.mes}`)).toEqual(['2026-3', '2026-4', '2026-5', '2026-6'])
  })

  it('cruza el límite de año hacia atrás correctamente', () => {
    const referencia = new Date('2026-02-10T12:00:00.000Z')
    const meses = obtenerIngresosPorMes(db, estacionamientoId, 3, referencia)

    expect(meses.map((m) => `${m.anio}-${m.mes}`)).toEqual(['2025-12', '2026-1', '2026-2'])
  })

  it('cada mes coincide exactamente con obtenerCorteMensual para ese mismo mes', () => {
    cerrarBoletoConFecha('2026-06-05T10:00:00.000Z', 40)
    cerrarBoletoConFecha('2026-07-20T10:00:00.000Z', 55)

    const referencia = new Date('2026-07-01T00:00:00.000Z')
    const meses = obtenerIngresosPorMes(db, estacionamientoId, 2, referencia)
    const [junio, julio] = meses

    const corteJunio = obtenerCorteMensual(db, estacionamientoId, 2026, 6)
    const corteJulio = obtenerCorteMensual(db, estacionamientoId, 2026, 7)

    expect(junio.montoBoletos).toBe(corteJunio.totalMonto)
    expect(junio.ingresos).toBe(corteJunio.totalMonto + corteJunio.pensionadosPagosMonto)
    expect(julio.montoBoletos).toBe(corteJulio.totalMonto)
    expect(julio.totalBoletos).toBe(1)
  })

  it('meses sin nada quedan en cero, no se omiten', () => {
    const meses = obtenerIngresosPorMes(db, estacionamientoId, 3, new Date('2026-06-15T00:00:00.000Z'))
    expect(meses.every((m) => m.ingresos === 0 && m.egresos === 0 && m.resultadoNeto === 0)).toBe(true)
  })

  it('egresos incluye TODOS los gastos del mes, sin importar forma de pago (a diferencia de gastosEfectivoMonto)', () => {
    cerrarBoletoConFecha('2026-06-05T10:00:00.000Z', 100)
    registrarGasto(db, {
      estacionamientoId,
      concepto: 'Renta',
      categoria: 'servicios',
      monto: 30,
      formaPago: 'transferencia',
      fecha: '2026-06-10T00:00:00.000Z',
      usuarioId
    })
    registrarGasto(db, {
      estacionamientoId,
      concepto: 'Escoba',
      categoria: 'operativo',
      monto: 10,
      formaPago: 'efectivo',
      fecha: '2026-06-11T00:00:00.000Z',
      usuarioId
    })

    const [junio] = obtenerIngresosPorMes(db, estacionamientoId, 1, new Date('2026-06-15T00:00:00.000Z'))

    expect(junio.ingresos).toBe(100)
    expect(junio.egresos).toBe(40)
    expect(junio.resultadoNeto).toBe(60)
  })
})

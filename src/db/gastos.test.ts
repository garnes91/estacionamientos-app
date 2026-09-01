import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerUsuarioPorDefecto } from './usuarios'
import { eliminarGasto, listarGastos, registrarGasto } from './gastos'

let db: DB
let estacionamientoId: number
let usuarioId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
  usuarioId = obtenerUsuarioPorDefecto(db, estacionamientoId).id
})

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

describe('registrarGasto', () => {
  it('lo registra y aparece en listarGastos', () => {
    const creado = gastoEjemplo()
    expect(listarGastos(db, estacionamientoId).map((g) => g.id)).toContain(creado.id)
  })

  it('rechaza un concepto vacío', () => {
    expect(() => gastoEjemplo({ concepto: '   ' })).toThrow('concepto')
  })

  it('rechaza un monto de 0 o negativo', () => {
    expect(() => gastoEjemplo({ monto: 0 })).toThrow('monto')
    expect(() => gastoEjemplo({ monto: -10 })).toThrow('monto')
  })
})

describe('listarGastos', () => {
  it('con rango de fechas, solo trae lo que cae en (desde, hasta]', () => {
    const enero = gastoEjemplo({ fecha: '2026-01-15T00:00:00.000Z' })
    gastoEjemplo({ fecha: '2026-02-15T00:00:00.000Z' })

    const deEnero = listarGastos(db, estacionamientoId, {
      desde: '2026-01-01T00:00:00.000Z',
      hasta: '2026-02-01T00:00:00.000Z'
    })
    expect(deEnero.map((g) => g.id)).toEqual([enero.id])
  })

  it('sin rango, trae todos los recientes primero', () => {
    gastoEjemplo({ fecha: '2026-01-01T00:00:00.000Z' })
    const masReciente = gastoEjemplo({ fecha: '2026-02-01T00:00:00.000Z' })

    expect(listarGastos(db, estacionamientoId)[0].id).toBe(masReciente.id)
  })
})

describe('eliminarGasto', () => {
  it('lo quita de la lista', () => {
    const creado = gastoEjemplo()
    eliminarGasto(db, creado.id)
    expect(listarGastos(db, estacionamientoId).map((g) => g.id)).not.toContain(creado.id)
  })

  it('lanza error si no existe', () => {
    expect(() => eliminarGasto(db, 9999)).toThrow('No existe el gasto')
  })
})

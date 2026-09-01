import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerUsuarioPorDefecto } from './usuarios'
import { listarTiposVehiculo } from './tiposVehiculo'
import {
  crearPensionado,
  darDeBajaPensionado,
  listarPensionados,
  registrarPago,
  sugerirSiguientePeriodo
} from './pensionados'

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

function altaEjemplo(overrides: Partial<Parameters<typeof crearPensionado>[1]> = {}) {
  return crearPensionado(db, {
    estacionamientoId,
    nombre: 'Juan Pérez',
    telefono: '5512345678',
    placa: 'abc-123',
    tipoVehiculoId: tipoAutoId,
    cuotaMensual: 800,
    usuarioAltaId: usuarioId,
    ...overrides
  })
}

describe('crearPensionado', () => {
  it('da de alta un pensionado activo, con la placa en mayúsculas', () => {
    const creado = altaEjemplo()
    expect(creado.estado).toBe('activo')
    expect(creado.placa).toBe('ABC-123')
    expect(creado.tipoVehiculo).toBe('Auto')
  })

  it('aparece en listarPensionados', () => {
    const creado = altaEjemplo()
    const lista = listarPensionados(db, estacionamientoId)
    expect(lista.map((p) => p.id)).toContain(creado.id)
  })

  it('vigenteHasta es la fecha de alta si nunca ha pagado', () => {
    const creado = altaEjemplo()
    expect(creado.vigenteHasta).toBe(creado.fechaAlta)
  })

  it('rechaza un nombre vacío', () => {
    expect(() => altaEjemplo({ nombre: '   ' })).toThrow('nombre')
  })
})

describe('darDeBajaPensionado', () => {
  it('lo saca de la lista de activos pero lo deja ver con incluirBajas', () => {
    const creado = altaEjemplo()
    darDeBajaPensionado(db, { id: creado.id, usuarioBajaId: usuarioId })

    expect(listarPensionados(db, estacionamientoId).map((p) => p.id)).not.toContain(creado.id)
    const conBajas = listarPensionados(db, estacionamientoId, true).find((p) => p.id === creado.id)!
    expect(conBajas.estado).toBe('baja')
    expect(conBajas.fechaBaja).toBeTruthy()
  })

  it('no se puede dar de baja dos veces', () => {
    const creado = altaEjemplo()
    darDeBajaPensionado(db, { id: creado.id, usuarioBajaId: usuarioId })
    expect(() => darDeBajaPensionado(db, { id: creado.id, usuarioBajaId: usuarioId })).toThrow('ya está dado de baja')
  })
})

describe('registrarPago y sugerirSiguientePeriodo', () => {
  it('el primer periodo sugerido arranca en la fecha de alta', () => {
    const creado = altaEjemplo()
    const sugerido = sugerirSiguientePeriodo(db, creado.id)
    expect(sugerido.periodoDesde).toBe(creado.fechaAlta)

    const inicio = new Date(sugerido.periodoDesde)
    const fin = new Date(sugerido.periodoHasta)
    expect(fin.getMonth()).toBe((inicio.getMonth() + 1) % 12)
  })

  it('registrar un pago mueve vigenteHasta y el siguiente periodo sugerido parte de ahí', () => {
    const creado = altaEjemplo()
    const primerPeriodo = sugerirSiguientePeriodo(db, creado.id)

    registrarPago(db, {
      pensionadoId: creado.id,
      periodoDesde: primerPeriodo.periodoDesde,
      periodoHasta: primerPeriodo.periodoHasta,
      monto: creado.cuotaMensual,
      usuarioId
    })

    const actualizado = listarPensionados(db, estacionamientoId).find((p) => p.id === creado.id)!
    expect(actualizado.vigenteHasta).toBe(primerPeriodo.periodoHasta)

    const segundoPeriodo = sugerirSiguientePeriodo(db, creado.id)
    expect(segundoPeriodo.periodoDesde).toBe(primerPeriodo.periodoHasta)
  })

  it('rechaza un periodo que termina antes de empezar', () => {
    const creado = altaEjemplo()
    expect(() =>
      registrarPago(db, {
        pensionadoId: creado.id,
        periodoDesde: '2026-02-01T00:00:00.000Z',
        periodoHasta: '2026-01-01T00:00:00.000Z',
        monto: 800,
        usuarioId
      })
    ).toThrow('después de que empieza')
  })

  it('no se puede registrar un pago de un pensionado dado de baja', () => {
    const creado = altaEjemplo()
    darDeBajaPensionado(db, { id: creado.id, usuarioBajaId: usuarioId })

    expect(() =>
      registrarPago(db, {
        pensionadoId: creado.id,
        periodoDesde: '2026-01-01T00:00:00.000Z',
        periodoHasta: '2026-02-01T00:00:00.000Z',
        monto: 800,
        usuarioId
      })
    ).toThrow('dado de baja')
  })
})

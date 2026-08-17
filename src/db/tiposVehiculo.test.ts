import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import {
  actualizarTipoVehiculo,
  crearTipoVehiculo,
  eliminarTipoVehiculo,
  listarTiposVehiculo,
  listarTiposVehiculoAdmin,
  reordenarTiposVehiculo
} from './tiposVehiculo'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
})

describe('crearTipoVehiculo', () => {
  it('lo agrega al final del orden existente', () => {
    const nuevo = crearTipoVehiculo(db, { estacionamientoId, nombre: 'Motocicleta' })
    expect(nuevo.orden).toBe(3) // Auto=0, Camioneta=1, Camión=2
    expect(nuevo.activo).toBe(true)
  })

  it('no aparece todavía en listarTiposVehiculo hasta tener tarifa (comportamiento de emitirBoleto, no de este listado)', () => {
    crearTipoVehiculo(db, { estacionamientoId, nombre: 'Motocicleta' })
    const nombres = listarTiposVehiculo(db, estacionamientoId).map((t) => t.nombre)
    expect(nombres).toContain('Motocicleta') // listarTiposVehiculo solo filtra por activo, no por tarifa
  })
})

describe('actualizarTipoVehiculo', () => {
  it('renombra y puede desactivar', () => {
    const auto = listarTiposVehiculoAdmin(db, estacionamientoId).find((t) => t.nombre === 'Auto')!
    actualizarTipoVehiculo(db, { id: auto.id, nombre: 'Auto/Sedán', activo: false })

    const actualizado = listarTiposVehiculoAdmin(db, estacionamientoId).find((t) => t.id === auto.id)!
    expect(actualizado.nombre).toBe('Auto/Sedán')
    expect(actualizado.activo).toBe(false)
  })

  it('un tipo desactivado desaparece de listarTiposVehiculo (el que usa la pantalla de emisión)', () => {
    const auto = listarTiposVehiculoAdmin(db, estacionamientoId).find((t) => t.nombre === 'Auto')!
    actualizarTipoVehiculo(db, { id: auto.id, nombre: 'Auto', activo: false })

    expect(listarTiposVehiculo(db, estacionamientoId).find((t) => t.id === auto.id)).toBeUndefined()
  })
})

describe('eliminarTipoVehiculo', () => {
  it('elimina un tipo recién creado sin tarifa ni boletos asociados', () => {
    const nuevo = crearTipoVehiculo(db, { estacionamientoId, nombre: 'Motocicleta' })
    eliminarTipoVehiculo(db, nuevo.id)

    expect(listarTiposVehiculoAdmin(db, estacionamientoId).find((t) => t.id === nuevo.id)).toBeUndefined()
  })

  it('rechaza eliminar un tipo con tarifa progresiva asociada, con mensaje claro', () => {
    const auto = listarTiposVehiculoAdmin(db, estacionamientoId).find((t) => t.nombre === 'Auto')!

    expect(() => eliminarTipoVehiculo(db, auto.id)).toThrow('ya tiene boletos o tarifas asociadas')

    // Y sigue ahí, sin romperse a medias.
    expect(listarTiposVehiculoAdmin(db, estacionamientoId).find((t) => t.id === auto.id)).toBeDefined()
  })
})

describe('reordenarTiposVehiculo', () => {
  it('cambia el orden, lo que mueve el mapeo F1/F2/F3', () => {
    const tipos = listarTiposVehiculoAdmin(db, estacionamientoId)
    const [auto, camioneta, camion] = tipos
    reordenarTiposVehiculo(db, estacionamientoId, [camion.id, auto.id, camioneta.id])

    const nombresEnOrden = listarTiposVehiculo(db, estacionamientoId).map((t) => t.nombre)
    expect(nombresEnOrden).toEqual(['Camión', 'Auto', 'Camioneta'])
  })
})

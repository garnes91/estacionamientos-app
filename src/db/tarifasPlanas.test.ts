import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerUsuarioPorDefecto } from './usuarios'
import { listarTiposVehiculo } from './tiposVehiculo'
import { cerrarBoleto, emitirBoleto } from './boletos'
import {
  actualizarTarifaPlana,
  cambiarPrecioTarifaPlana,
  crearTarifaPlana,
  listarTarifasPlanas
} from './tarifasPlanas'

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

describe('crearTarifaPlana / listarTarifasPlanas', () => {
  it('empieza vacío (nada sembrado por defecto)', () => {
    expect(listarTarifasPlanas(db, estacionamientoId)).toEqual([])
  })

  it('la tarifa creada aparece activa en el listado', () => {
    crearTarifaPlana(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, nombre: 'Plana 8h', precioFijo: 80, horasIncluidas: 8 })
    const planas = listarTarifasPlanas(db, estacionamientoId)
    expect(planas).toHaveLength(1)
    expect(planas[0]).toMatchObject({ nombre: 'Plana 8h', precioFijo: 80, horasIncluidas: 8, activo: true })
  })
})

describe('actualizarTarifaPlana', () => {
  it('renombrar/desactivar no crea una versión nueva', () => {
    const plana = crearTarifaPlana(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      nombre: 'Plana 8h',
      precioFijo: 80,
      horasIncluidas: 8
    })
    actualizarTarifaPlana(db, { id: plana.id, nombre: 'Plana medio día', activo: false })

    const planas = listarTarifasPlanas(db, estacionamientoId)
    expect(planas.find((p) => p.id === plana.id)?.nombre).toBe('Plana medio día')
    expect(planas.find((p) => p.id === plana.id)?.activo).toBe(false)
  })
})

describe('cambiarPrecioTarifaPlana', () => {
  it('crea una versión nueva y dos boletos abiertos con precios distintos cobran correcto', () => {
    const original = crearTarifaPlana(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      nombre: 'Plana 8h',
      precioFijo: 80,
      horasIncluidas: 8
    })

    const boletoConPrecioViejo = emitirBoleto(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      usuarioEmisionId: usuarioId,
      tarifaPlanaId: original.id
    })
    backdatar(boletoConPrecioViejo.id, 60) // dentro de las 8h incluidas

    const nueva = cambiarPrecioTarifaPlana(db, {
      id: original.id,
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      nombre: 'Plana 8h',
      precioFijo: 120,
      horasIncluidas: 8
    })
    expect(nueva.id).not.toBe(original.id)

    // El boleto viejo sigue cobrando el precio con el que se emitió.
    const cierreViejo = cerrarBoleto(db, { boletoId: boletoConPrecioViejo.id, usuarioCobroId: usuarioId })
    expect(cierreViejo.monto).toBe(80)

    // Un boleto nuevo usa el precio actualizado.
    const boletoNuevo = emitirBoleto(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      usuarioEmisionId: usuarioId,
      tarifaPlanaId: nueva.id
    })
    backdatar(boletoNuevo.id, 60)
    const cierreNuevo = cerrarBoleto(db, { boletoId: boletoNuevo.id, usuarioCobroId: usuarioId })
    expect(cierreNuevo.monto).toBe(120)
  })

  it('la versión vieja ya no aparece en listarTarifasPlanas (solo vigentes)', () => {
    const original = crearTarifaPlana(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      nombre: 'Plana 8h',
      precioFijo: 80,
      horasIncluidas: 8
    })
    cambiarPrecioTarifaPlana(db, {
      id: original.id,
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      nombre: 'Plana 8h',
      precioFijo: 120,
      horasIncluidas: 8
    })

    const planas = listarTarifasPlanas(db, estacionamientoId)
    expect(planas).toHaveLength(1)
    expect(planas[0].precioFijo).toBe(120)
  })
})

describe('emitirBoleto con tarifaPlanaId', () => {
  it('rechaza una tarifa plana de otro tipo de vehículo', () => {
    const tipoCamionetaId = listarTiposVehiculo(db, estacionamientoId).find((t) => t.nombre === 'Camioneta')!.id
    const planaAuto = crearTarifaPlana(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      nombre: 'Plana 8h',
      precioFijo: 80,
      horasIncluidas: 8
    })

    expect(() =>
      emitirBoleto(db, {
        estacionamientoId,
        tipoVehiculoId: tipoCamionetaId,
        usuarioEmisionId: usuarioId,
        tarifaPlanaId: planaAuto.id
      })
    ).toThrow('no está vigente para este tipo de vehículo')
  })

  it('rechaza una tarifa plana desactivada', () => {
    const plana = crearTarifaPlana(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      nombre: 'Plana 8h',
      precioFijo: 80,
      horasIncluidas: 8
    })
    actualizarTarifaPlana(db, { id: plana.id, nombre: plana.nombre, activo: false })

    expect(() =>
      emitirBoleto(db, {
        estacionamientoId,
        tipoVehiculoId: tipoAutoId,
        usuarioEmisionId: usuarioId,
        tarifaPlanaId: plana.id
      })
    ).toThrow('no está vigente para este tipo de vehículo')
  })
})

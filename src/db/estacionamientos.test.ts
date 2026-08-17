import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { actualizarNombreEstacionamiento, actualizarTextoBoleto, obtenerEstacionamientoActual } from './estacionamientos'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
})

describe('actualizarTextoBoleto', () => {
  it('empieza en null (sin configurar)', () => {
    expect(obtenerEstacionamientoActual(db).textoBoleto).toBeNull()
  })

  it('guarda el texto y se refleja en obtenerEstacionamientoActual', () => {
    actualizarTextoBoleto(db, estacionamientoId, 'RFC: XAXX010101000\nAv. Siempre Viva 123')
    expect(obtenerEstacionamientoActual(db).textoBoleto).toBe('RFC: XAXX010101000\nAv. Siempre Viva 123')
  })

  it('se puede volver a limpiar pasando null', () => {
    actualizarTextoBoleto(db, estacionamientoId, 'algo')
    actualizarTextoBoleto(db, estacionamientoId, null)
    expect(obtenerEstacionamientoActual(db).textoBoleto).toBeNull()
  })
})

describe('actualizarNombreEstacionamiento', () => {
  it('cambia el nombre y se refleja en obtenerEstacionamientoActual', () => {
    actualizarNombreEstacionamiento(db, estacionamientoId, 'Estacionamiento Centro')
    expect(obtenerEstacionamientoActual(db).nombre).toBe('Estacionamiento Centro')
  })

  it('recorta espacios sobrantes', () => {
    actualizarNombreEstacionamiento(db, estacionamientoId, '  Estacionamiento Norte  ')
    expect(obtenerEstacionamientoActual(db).nombre).toBe('Estacionamiento Norte')
  })

  it('rechaza un nombre vacío o solo espacios', () => {
    expect(() => actualizarNombreEstacionamiento(db, estacionamientoId, '')).toThrow('no puede quedar vacío')
    expect(() => actualizarNombreEstacionamiento(db, estacionamientoId, '   ')).toThrow('no puede quedar vacío')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { guardarConfiguracionFacturacion, obtenerConfiguracionFacturacion } from './configuracionFacturacion'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
})

const configEjemplo = {
  habilitado: true,
  codigoPostalFiscal: '44100',
  claveProductoServicio: '78101803',
  claveUnidad: 'E48',
  descripcionServicio: 'Servicio de estacionamiento'
}

describe('obtenerConfiguracionFacturacion', () => {
  it('devuelve null si nunca se configuró', () => {
    expect(obtenerConfiguracionFacturacion(db, estacionamientoId)).toBeNull()
  })
})

describe('guardarConfiguracionFacturacion', () => {
  it('guarda y se puede volver a leer tal cual', () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, configEjemplo)
    expect(obtenerConfiguracionFacturacion(db, estacionamientoId)).toEqual(configEjemplo)
  })

  it('rechaza un código postal que no tenga 5 dígitos', () => {
    expect(() =>
      guardarConfiguracionFacturacion(db, estacionamientoId, { ...configEjemplo, codigoPostalFiscal: '441' })
    ).toThrow('código postal')
  })

  it('guardar de nuevo actualiza en vez de duplicar', () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, configEjemplo)
    guardarConfiguracionFacturacion(db, estacionamientoId, { ...configEjemplo, habilitado: false })

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM configuracion_facturacion').get() as { n: number }
    expect(n).toBe(1)
    expect(obtenerConfiguracionFacturacion(db, estacionamientoId)?.habilitado).toBe(false)
  })
})

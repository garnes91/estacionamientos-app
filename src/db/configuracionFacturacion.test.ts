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
  rfc: 'XAXX010101000',
  razonSocial: 'Estacionamientos del Centro SA de CV',
  regimenFiscal: '626',
  codigoPostalFiscal: '44100',
  claveProductoServicio: '78101803',
  claveUnidad: 'E48'
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

  it('normaliza el RFC a mayúsculas', () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, { ...configEjemplo, rfc: 'xaxx010101000' })
    expect(obtenerConfiguracionFacturacion(db, estacionamientoId)?.rfc).toBe('XAXX010101000')
  })

  it('rechaza un RFC con formato inválido', () => {
    expect(() =>
      guardarConfiguracionFacturacion(db, estacionamientoId, { ...configEjemplo, rfc: 'NO-VALIDO' })
    ).toThrow('RFC')
  })

  it('rechaza un régimen fiscal que no sea la clave numérica de 3 dígitos', () => {
    expect(() =>
      guardarConfiguracionFacturacion(db, estacionamientoId, { ...configEjemplo, regimenFiscal: 'RESICO' })
    ).toThrow('régimen fiscal')
  })

  it('rechaza un código postal que no tenga 5 dígitos', () => {
    expect(() =>
      guardarConfiguracionFacturacion(db, estacionamientoId, { ...configEjemplo, codigoPostalFiscal: '441' })
    ).toThrow('código postal')
  })

  it('rechaza una razón social vacía', () => {
    expect(() =>
      guardarConfiguracionFacturacion(db, estacionamientoId, { ...configEjemplo, razonSocial: '   ' })
    ).toThrow('razón social')
  })

  it('guardar de nuevo actualiza en vez de duplicar', () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, configEjemplo)
    guardarConfiguracionFacturacion(db, estacionamientoId, { ...configEjemplo, habilitado: false })

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM configuracion_facturacion').get() as { n: number }
    expect(n).toBe(1)
    expect(obtenerConfiguracionFacturacion(db, estacionamientoId)?.habilitado).toBe(false)
  })
})

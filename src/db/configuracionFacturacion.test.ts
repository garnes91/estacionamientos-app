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

describe('obtenerConfiguracionFacturacion', () => {
  it('devuelve null si nunca se configuró', () => {
    expect(obtenerConfiguracionFacturacion(db, estacionamientoId)).toBeNull()
  })
})

describe('guardarConfiguracionFacturacion', () => {
  it('guarda y se puede volver a leer tal cual', () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, { habilitado: true })
    expect(obtenerConfiguracionFacturacion(db, estacionamientoId)).toEqual({ habilitado: true })
  })

  it('guardar de nuevo actualiza en vez de duplicar', () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, { habilitado: true })
    guardarConfiguracionFacturacion(db, estacionamientoId, { habilitado: false })

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM configuracion_facturacion').get() as { n: number }
    expect(n).toBe(1)
    expect(obtenerConfiguracionFacturacion(db, estacionamientoId)?.habilitado).toBe(false)
  })
})

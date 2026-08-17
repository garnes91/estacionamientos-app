import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { guardarConfiguracionMonitoreo, obtenerConfiguracionMonitoreo } from './configuracionMonitoreo'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
})

const configEjemplo = {
  habilitado: true,
  apiKey: 'AIzaSyABC123',
  projectId: 'mi-proyecto-firebase',
  slug: 'centro'
}

describe('obtenerConfiguracionMonitoreo', () => {
  it('devuelve null si nunca se configuró', () => {
    expect(obtenerConfiguracionMonitoreo(db, estacionamientoId)).toBeNull()
  })
})

describe('guardarConfiguracionMonitoreo', () => {
  it('guarda y se puede volver a leer tal cual', () => {
    guardarConfiguracionMonitoreo(db, estacionamientoId, configEjemplo)
    expect(obtenerConfiguracionMonitoreo(db, estacionamientoId)).toEqual(configEjemplo)
  })

  it('normaliza el slug a minúsculas', () => {
    guardarConfiguracionMonitoreo(db, estacionamientoId, { ...configEjemplo, slug: 'Centro-Norte' })
    expect(obtenerConfiguracionMonitoreo(db, estacionamientoId)?.slug).toBe('centro-norte')
  })

  it('rechaza un slug con espacios o símbolos', () => {
    expect(() => guardarConfiguracionMonitoreo(db, estacionamientoId, { ...configEjemplo, slug: 'mi estacionamiento' })).toThrow(
      'debe ser minúsculas'
    )
    expect(() => guardarConfiguracionMonitoreo(db, estacionamientoId, { ...configEjemplo, slug: 'centro/norte' })).toThrow(
      'debe ser minúsculas'
    )
  })

  it('guardar de nuevo actualiza en vez de duplicar', () => {
    guardarConfiguracionMonitoreo(db, estacionamientoId, configEjemplo)
    guardarConfiguracionMonitoreo(db, estacionamientoId, { ...configEjemplo, habilitado: false })

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM configuracion_monitoreo').get() as { n: number }
    expect(n).toBe(1)
    expect(obtenerConfiguracionMonitoreo(db, estacionamientoId)?.habilitado).toBe(false)
  })
})

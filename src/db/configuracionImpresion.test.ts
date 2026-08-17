import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { guardarConfiguracionImpresion, obtenerConfiguracionImpresion } from './configuracionImpresion'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
})

describe('obtenerConfiguracionImpresion', () => {
  it('devuelve null si nunca se configuró', () => {
    expect(obtenerConfiguracionImpresion(db, estacionamientoId)).toBeNull()
  })
})

describe('guardarConfiguracionImpresion', () => {
  it('guarda y se puede volver a leer tal cual', () => {
    const config = { impresoraTicket: 'EPSON TM-T88', impresoraReporte: 'HP LaserJet' }
    guardarConfiguracionImpresion(db, estacionamientoId, config)
    expect(obtenerConfiguracionImpresion(db, estacionamientoId)).toEqual(config)
  })

  it('permite dejar una impresora sin configurar (null)', () => {
    guardarConfiguracionImpresion(db, estacionamientoId, { impresoraTicket: 'EPSON TM-T88', impresoraReporte: null })
    expect(obtenerConfiguracionImpresion(db, estacionamientoId)).toEqual({
      impresoraTicket: 'EPSON TM-T88',
      impresoraReporte: null
    })
  })

  it('guardar de nuevo actualiza en vez de duplicar', () => {
    guardarConfiguracionImpresion(db, estacionamientoId, { impresoraTicket: 'A', impresoraReporte: 'B' })
    guardarConfiguracionImpresion(db, estacionamientoId, { impresoraTicket: 'C', impresoraReporte: 'B' })

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM configuracion_impresion').get() as { n: number }
    expect(n).toBe(1)
    expect(obtenerConfiguracionImpresion(db, estacionamientoId)?.impresoraTicket).toBe('C')
  })
})

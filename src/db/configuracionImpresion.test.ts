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
    const config = {
      impresoraTicket: 'EPSON TM-T88',
      impresoraReporte: 'HP LaserJet',
      ticketModoCrudo: false,
      ticketUsbVendorId: null,
      ticketUsbProductId: null,
      ticketImpresoraCompartida: null
    }
    guardarConfiguracionImpresion(db, estacionamientoId, config)
    expect(obtenerConfiguracionImpresion(db, estacionamientoId)).toEqual(config)
  })

  it('permite dejar una impresora sin configurar (null)', () => {
    guardarConfiguracionImpresion(db, estacionamientoId, {
      impresoraTicket: 'EPSON TM-T88',
      impresoraReporte: null,
      ticketModoCrudo: false,
      ticketUsbVendorId: null,
      ticketUsbProductId: null,
      ticketImpresoraCompartida: null
    })
    expect(obtenerConfiguracionImpresion(db, estacionamientoId)).toEqual({
      impresoraTicket: 'EPSON TM-T88',
      impresoraReporte: null,
      ticketModoCrudo: false,
      ticketUsbVendorId: null,
      ticketUsbProductId: null,
      ticketImpresoraCompartida: null
    })
  })

  it('guardar de nuevo actualiza en vez de duplicar', () => {
    guardarConfiguracionImpresion(db, estacionamientoId, {
      impresoraTicket: 'A',
      impresoraReporte: 'B',
      ticketModoCrudo: false,
      ticketUsbVendorId: null,
      ticketUsbProductId: null,
      ticketImpresoraCompartida: null
    })
    guardarConfiguracionImpresion(db, estacionamientoId, {
      impresoraTicket: 'C',
      impresoraReporte: 'B',
      ticketModoCrudo: false,
      ticketUsbVendorId: null,
      ticketUsbProductId: null,
      ticketImpresoraCompartida: null
    })

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM configuracion_impresion').get() as { n: number }
    expect(n).toBe(1)
    expect(obtenerConfiguracionImpresion(db, estacionamientoId)?.impresoraTicket).toBe('C')
  })

  it('guarda el modo crudo y el vendorId/productId del dispositivo USB (Mac/Linux)', () => {
    const config = {
      impresoraTicket: null,
      impresoraReporte: null,
      ticketModoCrudo: true,
      ticketUsbVendorId: 0x04b8,
      ticketUsbProductId: 0x0202,
      ticketImpresoraCompartida: null
    }
    guardarConfiguracionImpresion(db, estacionamientoId, config)
    expect(obtenerConfiguracionImpresion(db, estacionamientoId)).toEqual(config)
  })

  it('guarda el modo crudo y el nombre de la impresora compartida (Windows)', () => {
    const config = {
      impresoraTicket: null,
      impresoraReporte: null,
      ticketModoCrudo: true,
      ticketUsbVendorId: null,
      ticketUsbProductId: null,
      ticketImpresoraCompartida: 'POS80'
    }
    guardarConfiguracionImpresion(db, estacionamientoId, config)
    expect(obtenerConfiguracionImpresion(db, estacionamientoId)).toEqual(config)
  })
})

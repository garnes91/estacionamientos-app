import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerOCrearClaveFolio } from './claveCifradoFolio'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
})

describe('obtenerOCrearClaveFolio', () => {
  it('genera una clave la primera vez', () => {
    const clave = obtenerOCrearClaveFolio(db, estacionamientoId)
    expect(clave).toHaveLength(32) // 16 bytes en hex
  })

  it('devuelve siempre la misma clave en llamadas posteriores', () => {
    const primera = obtenerOCrearClaveFolio(db, estacionamientoId)
    const segunda = obtenerOCrearClaveFolio(db, estacionamientoId)
    expect(segunda).toBe(primera)

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM clave_cifrado_folio').get() as { n: number }
    expect(n).toBe(1)
  })
})

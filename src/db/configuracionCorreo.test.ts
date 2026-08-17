import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { guardarConfiguracionCorreo, obtenerConfiguracionCorreo } from './configuracionCorreo'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
})

const configEjemplo = {
  host: 'smtp.gmail.com',
  puerto: 587,
  seguro: false,
  usuario: 'estacionamiento@example.com',
  password: 'clave-de-aplicacion',
  remitente: 'Mi Estacionamiento <estacionamiento@example.com>',
  destinatarios: 'dueno@example.com, contador@example.com'
}

describe('obtenerConfiguracionCorreo', () => {
  it('devuelve null si nunca se configuró', () => {
    expect(obtenerConfiguracionCorreo(db, estacionamientoId)).toBeNull()
  })
})

describe('guardarConfiguracionCorreo', () => {
  it('guarda y se puede volver a leer tal cual', () => {
    guardarConfiguracionCorreo(db, estacionamientoId, configEjemplo)
    expect(obtenerConfiguracionCorreo(db, estacionamientoId)).toEqual(configEjemplo)
  })

  it('guardar de nuevo actualiza en vez de duplicar (una sola fila por estacionamiento)', () => {
    guardarConfiguracionCorreo(db, estacionamientoId, configEjemplo)
    guardarConfiguracionCorreo(db, estacionamientoId, { ...configEjemplo, puerto: 465, seguro: true })

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM configuracion_correo').get() as { n: number }
    expect(n).toBe(1)

    const actual = obtenerConfiguracionCorreo(db, estacionamientoId)
    expect(actual?.puerto).toBe(465)
    expect(actual?.seguro).toBe(true)
  })
})

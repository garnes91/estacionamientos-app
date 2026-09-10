import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abrirDb, DB } from '../db'
import { sembrarSiVacio } from '../db/seed'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { guardarConfiguracionFacturacion } from '../db/configuracionFacturacion'
import { guardarConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { sincronizarCatalogoFacturacion } from './facturacionCatalogoSync'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
})

afterEach(() => {
  vi.restoreAllMocks()
})

const configFacturacionEjemplo = {
  habilitado: true,
  rfc: 'XAXX010101000',
  razonSocial: 'Estacionamientos del Centro SA de CV',
  regimenFiscal: '626',
  codigoPostalFiscal: '44100',
  claveProductoServicio: '78101803',
  claveUnidad: 'E48',
  descripcionServicio: 'Servicio de estacionamiento'
}

const configMonitoreoEjemplo = {
  habilitado: true,
  apiKey: 'AIzaSyABC123',
  projectId: 'mi-proyecto-firebase',
  slug: 'centro',
  respaldoNube: false
}

describe('sincronizarCatalogoFacturacion', () => {
  it('no llama a Firestore si facturación no está habilitada', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)
    guardarConfiguracionFacturacion(db, estacionamientoId, { ...configFacturacionEjemplo, habilitado: false })

    await sincronizarCatalogoFacturacion(db, estacionamientoId)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('no llama a Firestore si no hay proyecto Firebase configurado', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    guardarConfiguracionFacturacion(db, estacionamientoId, configFacturacionEjemplo)

    await sincronizarCatalogoFacturacion(db, estacionamientoId)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sube solo los 4 campos no secretos a facturacionSecretos/{slug}', async () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, configFacturacionEjemplo)
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('identitytoolkit')) {
        return Promise.resolve(
          new Response(JSON.stringify({ idToken: 'token-de-prueba', expiresIn: '3600' }), { status: 200 })
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    await sincronizarCatalogoFacturacion(db, estacionamientoId)

    const llamadaPatch = fetchSpy.mock.calls.find(([input]) => !String(input).includes('identitytoolkit'))
    expect(llamadaPatch).toBeDefined()
    const [url, opciones] = llamadaPatch!
    expect(String(url)).toContain(`facturacionSecretos/${configMonitoreoEjemplo.slug}`)
    expect((opciones as RequestInit).method).toBe('PATCH')

    const cuerpo = JSON.parse((opciones as RequestInit).body as string)
    expect(Object.keys(cuerpo.fields).sort()).toEqual(
      ['claveProductoServicio', 'claveUnidad', 'codigoPostalFiscal', 'descripcionServicio'].sort()
    )
    expect(cuerpo.fields.claveProductoServicio.stringValue).toBe('78101803')
    expect(cuerpo.fields.codigoPostalFiscal.stringValue).toBe('44100')
    // No debe llevar organizationId ni secretKey — nunca se suben desde ningún cliente.
    expect(cuerpo.fields.secretKey).toBeUndefined()
    expect(cuerpo.fields.organizationId).toBeUndefined()
  })

  it('no lanza si Firestore falla', async () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, configFacturacionEjemplo)
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sin conexión'))

    await expect(sincronizarCatalogoFacturacion(db, estacionamientoId)).resolves.toBeUndefined()
  })
})

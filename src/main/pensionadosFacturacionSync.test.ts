import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abrirDb, DB } from '../db'
import { sembrarSiVacio } from '../db/seed'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerUsuarioPorDefecto } from '../db/usuarios'
import { listarTiposVehiculo } from '../db/tiposVehiculo'
import { crearPensionado, registrarPago } from '../db/pensionados'
import { guardarConfiguracionFacturacion } from '../db/configuracionFacturacion'
import { guardarConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { sincronizarPagoPensionado } from './pensionadosFacturacionSync'

let db: DB
let estacionamientoId: number
let usuarioId: number
let tipoAutoId: number
let pensionadoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
  usuarioId = obtenerUsuarioPorDefecto(db, estacionamientoId).id
  tipoAutoId = listarTiposVehiculo(db, estacionamientoId).find((t) => t.nombre === 'Auto')!.id
  pensionadoId = crearPensionado(db, {
    estacionamientoId,
    nombre: 'Ana Pérez',
    tipoVehiculoId: tipoAutoId,
    cuotaMensual: 800,
    usuarioAltaId: usuarioId
  }).id
})

afterEach(() => {
  vi.restoreAllMocks()
})

function registrarPagoDePrueba() {
  return registrarPago(db, {
    pensionadoId,
    periodoDesde: '2026-09-01T00:00:00.000Z',
    periodoHasta: '2026-10-01T00:00:00.000Z',
    monto: 800,
    usuarioId
  })
}

const configFacturacionEjemplo = {
  habilitado: true,
  rfc: 'XAXX010101000',
  razonSocial: 'Estacionamientos del Centro SA de CV',
  regimenFiscal: '626',
  codigoPostalFiscal: '44100',
  claveProductoServicio: '78101803',
  claveUnidad: 'E48'
}

const configMonitoreoEjemplo = {
  habilitado: true,
  apiKey: 'AIzaSyABC123',
  projectId: 'mi-proyecto-firebase',
  slug: 'centro',
  respaldoNube: false
}

describe('sincronizarPagoPensionado', () => {
  it('no llama a Firestore si la facturación no está habilitada', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)

    await sincronizarPagoPensionado(db, estacionamientoId, registrarPagoDePrueba())

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('no llama a Firestore si no hay proyecto Firebase configurado', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    guardarConfiguracionFacturacion(db, estacionamientoId, configFacturacionEjemplo)

    await sincronizarPagoPensionado(db, estacionamientoId, registrarPagoDePrueba())

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sube el pago a una colección aparte de la de boletos, con el nombre del pensionado y facturado=false', async () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, configFacturacionEjemplo)
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)
    const pago = registrarPagoDePrueba()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('identitytoolkit')) {
        return Promise.resolve(
          new Response(JSON.stringify({ idToken: 'token-de-prueba', expiresIn: '3600' }), { status: 200 })
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    await sincronizarPagoPensionado(db, estacionamientoId, pago)

    const llamadaPatch = fetchSpy.mock.calls.find(([input]) => !String(input).includes('identitytoolkit'))
    expect(llamadaPatch).toBeDefined()
    const [url, opciones] = llamadaPatch!
    expect(String(url)).toContain(`estacionamientos/${configMonitoreoEjemplo.slug}/pagosPensionadosFacturables/`)
    expect(String(url)).not.toContain('boletosFacturables')
    expect((opciones as RequestInit).method).toBe('PATCH')

    const cuerpo = JSON.parse((opciones as RequestInit).body as string)
    expect(cuerpo.fields.pensionadoNombre.stringValue).toBe('Ana Pérez')
    expect(cuerpo.fields.monto.doubleValue).toBe(800)
    expect(cuerpo.fields.facturado.booleanValue).toBe(false)
  })

  it('no lanza si Firestore falla — el pago ya quedó guardado localmente', async () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, configFacturacionEjemplo)
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sin conexión'))

    await expect(sincronizarPagoPensionado(db, estacionamientoId, registrarPagoDePrueba())).resolves.toBeUndefined()
  })
})

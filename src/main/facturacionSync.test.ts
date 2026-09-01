import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abrirDb, DB } from '../db'
import { sembrarSiVacio } from '../db/seed'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerUsuarioPorDefecto } from '../db/usuarios'
import { listarTiposVehiculo } from '../db/tiposVehiculo'
import { cerrarBoleto, emitirBoleto } from '../db/boletos'
import { guardarConfiguracionFacturacion } from '../db/configuracionFacturacion'
import { guardarConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { sincronizarBoletoCerrado } from './facturacionSync'

let db: DB
let estacionamientoId: number
let usuarioId: number
let tipoAutoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
  usuarioId = obtenerUsuarioPorDefecto(db, estacionamientoId).id
  tipoAutoId = listarTiposVehiculo(db, estacionamientoId).find((t) => t.nombre === 'Auto')!.id
})

afterEach(() => {
  vi.restoreAllMocks()
})

function cerrarUnBoleto() {
  const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
  return cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
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
  slug: 'centro'
}

describe('sincronizarBoletoCerrado', () => {
  it('no llama a Firestore si la facturación no está habilitada', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)
    // facturación nunca configurada

    await sincronizarBoletoCerrado(db, estacionamientoId, cerrarUnBoleto())

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('no llama a Firestore si facturación existe pero está deshabilitada', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    guardarConfiguracionFacturacion(db, estacionamientoId, { ...configFacturacionEjemplo, habilitado: false })
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)

    await sincronizarBoletoCerrado(db, estacionamientoId, cerrarUnBoleto())

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('no llama a Firestore si no hay proyecto Firebase configurado', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    guardarConfiguracionFacturacion(db, estacionamientoId, configFacturacionEjemplo)
    // monitoreo (credenciales de Firebase) nunca configurado

    await sincronizarBoletoCerrado(db, estacionamientoId, cerrarUnBoleto())

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sube el boleto a Firestore con el código impreso como llave del documento y facturado=false', async () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, configFacturacionEjemplo)
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)
    const cierre = cerrarUnBoleto()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('identitytoolkit')) {
        return Promise.resolve(
          new Response(JSON.stringify({ idToken: 'token-de-prueba', expiresIn: '3600' }), { status: 200 })
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    await sincronizarBoletoCerrado(db, estacionamientoId, cierre)

    const llamadaPatch = fetchSpy.mock.calls.find(([input]) => !String(input).includes('identitytoolkit'))
    expect(llamadaPatch).toBeDefined()
    const [url, opciones] = llamadaPatch!
    expect(String(url)).toContain(`estacionamientos/${configMonitoreoEjemplo.slug}/boletosFacturables/`)
    expect((opciones as RequestInit).method).toBe('PATCH')

    const cuerpo = JSON.parse((opciones as RequestInit).body as string)
    expect(cuerpo.fields.serie.stringValue).toBe(cierre.serie)
    expect(cuerpo.fields.monto.doubleValue).toBe(cierre.monto)
    expect(cuerpo.fields.facturado.booleanValue).toBe(false)
  })

  it('no lanza si Firestore falla — el cobro ya quedó guardado localmente', async () => {
    guardarConfiguracionFacturacion(db, estacionamientoId, configFacturacionEjemplo)
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sin conexión'))

    await expect(sincronizarBoletoCerrado(db, estacionamientoId, cerrarUnBoleto())).resolves.toBeUndefined()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abrirDb, DB } from '../db'
import { sembrarSiVacio } from '../db/seed'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { guardarConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { cerrarBoleto, emitirBoleto } from '../db/boletos'
import { obtenerUsuarioPorDefecto } from '../db/usuarios'
import { listarTiposVehiculo } from '../db/tiposVehiculo'
import { sincronizarEstadisticas } from './estadisticasSync'

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

const configMonitoreoEjemplo = {
  habilitado: true,
  apiKey: 'AIzaSyABC123',
  projectId: 'mi-proyecto-firebase',
  slug: 'centro',
  respaldoNube: false
}

describe('sincronizarEstadisticas', () => {
  it('no llama a Firestore si no hay proyecto configurado', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await sincronizarEstadisticas(db, estacionamientoId)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('no llama a Firestore si el monitoreo está deshabilitado', async () => {
    guardarConfiguracionMonitoreo(db, estacionamientoId, { ...configMonitoreoEjemplo, habilitado: false })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await sincronizarEstadisticas(db, estacionamientoId)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sube los últimos 13 meses al mismo documento que el latido', async () => {
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)

    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    const cierre = cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
    db.prepare('UPDATE boletos SET monto_cobrado = 100 WHERE id = ?').run(cierre.id)

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('identitytoolkit')) {
        return Promise.resolve(
          new Response(JSON.stringify({ idToken: 'token-de-prueba', expiresIn: '3600' }), { status: 200 })
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    await sincronizarEstadisticas(db, estacionamientoId)

    const llamadaPatch = fetchSpy.mock.calls.find(([input]) => !String(input).includes('identitytoolkit'))
    expect(llamadaPatch).toBeDefined()
    const [url, opciones] = llamadaPatch!
    expect(String(url)).toContain(`estacionamientos/${configMonitoreoEjemplo.slug}`)
    expect((opciones as RequestInit).method).toBe('PATCH')

    const cuerpo = JSON.parse((opciones as RequestInit).body as string)
    const meses = cuerpo.fields.estadisticasMensuales.arrayValue.values
    expect(meses).toHaveLength(13)
    const mesActual = meses[12].mapValue.fields
    expect(Number(mesActual.ingresos.doubleValue ?? mesActual.ingresos.integerValue)).toBe(100)
  })

  it('no lanza si Firestore falla — no debe tumbar el corte que lo disparó', async () => {
    guardarConfiguracionMonitoreo(db, estacionamientoId, configMonitoreoEjemplo)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sin conexión'))

    await expect(sincronizarEstadisticas(db, estacionamientoId)).resolves.toBeUndefined()
  })
})

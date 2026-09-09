import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rutaRespaldoDelDia } from './respaldos'
import { listarRespaldosNube, subirRespaldoNubeSiHaceFalta } from './respaldoNube'
import type { ConfiguracionMonitoreo } from '../db/configuracionMonitoreo'

let carpetaTemporal: string

beforeEach(() => {
  carpetaTemporal = mkdtempSync(join(tmpdir(), 'estacionamientos-respaldo-nube-test-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(carpetaTemporal, { recursive: true, force: true })
})

const fecha = new Date('2026-09-09T12:00:00.000Z')

function configEjemplo(apiKey: string, extra: Partial<ConfiguracionMonitoreo> = {}): ConfiguracionMonitoreo {
  return { habilitado: true, apiKey, projectId: 'parkio-d6289', slug: 'centro', respaldoNube: true, ...extra }
}

/** Simula Firebase Storage: identitytoolkit da un token, list/upload/delete responden según lo que ya se "subió". */
function mockStorage(itemsIniciales: { name: string; size: string; updated: string }[] = []) {
  const items = [...itemsIniciales]
  const llamadas: { metodo: string; url: string }[] = []

  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const metodo = init?.method ?? 'GET'
    llamadas.push({ metodo, url })

    if (url.includes('identitytoolkit')) {
      return Promise.resolve(new Response(JSON.stringify({ idToken: 'token', expiresIn: '3600' }), { status: 200 }))
    }
    if (url.includes('uploadType=media')) {
      const match = /name=([^&]+)/.exec(url)
      const nombre = decodeURIComponent(match![1])
      items.push({ name: nombre, size: '10', updated: new Date().toISOString() })
      return Promise.resolve(new Response('{}', { status: 200 }))
    }
    if (metodo === 'DELETE') {
      const nombre = decodeURIComponent(url.split('/o/')[1])
      const i = items.findIndex((it) => it.name === nombre)
      if (i >= 0) items.splice(i, 1)
      return Promise.resolve(new Response('{}', { status: 200 }))
    }
    // GET de listar
    return Promise.resolve(new Response(JSON.stringify({ items }), { status: 200 }))
  })

  return { items, llamadas }
}

function crearRespaldoLocalDelDia(contenido = 'contenido-del-respaldo'): void {
  writeFileSync(rutaRespaldoDelDia(carpetaTemporal, fecha), contenido)
}

describe('subirRespaldoNubeSiHaceFalta', () => {
  it('no hace nada si respaldoNube está desactivado', async () => {
    crearRespaldoLocalDelDia()
    const { llamadas } = mockStorage()

    await subirRespaldoNubeSiHaceFalta(carpetaTemporal, configEjemplo('key-1', { respaldoNube: false }), fecha)

    expect(llamadas).toHaveLength(0)
  })

  it('no hace nada si todavía no existe el respaldo local del día', async () => {
    const { llamadas } = mockStorage()

    await subirRespaldoNubeSiHaceFalta(carpetaTemporal, configEjemplo('key-2'), fecha)

    expect(llamadas).toHaveLength(0)
  })

  it('sube el respaldo local del día si todavía no está en la nube', async () => {
    crearRespaldoLocalDelDia()
    const { items } = mockStorage()

    await subirRespaldoNubeSiHaceFalta(carpetaTemporal, configEjemplo('key-3'), fecha)

    expect(items.map((i) => i.name)).toEqual(['respaldos/centro/estacionamientos-2026-09-09.db'])
  })

  it('no lo vuelve a subir si ya está el de hoy', async () => {
    crearRespaldoLocalDelDia()
    const { llamadas } = mockStorage([
      { name: 'respaldos/centro/estacionamientos-2026-09-09.db', size: '10', updated: fecha.toISOString() }
    ])

    await subirRespaldoNubeSiHaceFalta(carpetaTemporal, configEjemplo('key-4'), fecha)

    expect(llamadas.some((l) => l.url.includes('uploadType=media'))).toBe(false)
  })

  it('conserva solo los 14 más recientes en la nube, borra los más viejos', async () => {
    crearRespaldoLocalDelDia()
    const viejos = Array.from({ length: 14 }, (_, i) => ({
      name: `respaldos/centro/estacionamientos-2026-08-${String(i + 20).padStart(2, '0')}.db`,
      size: '10',
      updated: new Date().toISOString()
    }))
    const { items } = mockStorage(viejos)

    await subirRespaldoNubeSiHaceFalta(carpetaTemporal, configEjemplo('key-5'), fecha)

    // 14 viejos + el de hoy = 15, se conservan 14 → se borra el más viejo (2026-08-20).
    expect(items.some((i) => i.name.includes('2026-08-20'))).toBe(false)
    expect(items.some((i) => i.name.includes('2026-09-09'))).toBe(true)
    expect(items).toHaveLength(14)
  })
})

describe('listarRespaldosNube', () => {
  it('quita el prefijo de carpeta y ordena por fecha, más reciente primero', async () => {
    mockStorage([
      { name: 'respaldos/centro/estacionamientos-2026-09-08.db', size: '100', updated: '2026-09-08T00:00:00.000Z' },
      { name: 'respaldos/centro/estacionamientos-2026-09-09.db', size: '200', updated: '2026-09-09T00:00:00.000Z' }
    ])

    const resultado = await listarRespaldosNube(configEjemplo('key-6'))

    expect(resultado).toEqual([
      { archivo: 'estacionamientos-2026-09-09.db', fecha: '2026-09-09T00:00:00.000Z', tamanoBytes: 200 },
      { archivo: 'estacionamientos-2026-09-08.db', fecha: '2026-09-08T00:00:00.000Z', tamanoBytes: 100 }
    ])
  })
})

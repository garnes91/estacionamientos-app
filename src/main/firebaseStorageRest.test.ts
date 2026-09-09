import { afterEach, describe, expect, it, vi } from 'vitest'
import { bucketPorDefecto, eliminarArchivo, listarArchivos, subirArchivo } from './firebaseStorageRest'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bucketPorDefecto', () => {
  it('usa el esquema nuevo de nombre de bucket', () => {
    expect(bucketPorDefecto('parkio-d6289')).toBe('parkio-d6289.firebasestorage.app')
  })
})

function mockFetch(respuestaPorDefecto: () => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('identitytoolkit')) {
      return Promise.resolve(new Response(JSON.stringify({ idToken: 'token-de-prueba', expiresIn: '3600' }), { status: 200 }))
    }
    return Promise.resolve(respuestaPorDefecto())
  })
}

describe('subirArchivo', () => {
  it('manda el contenido con uploadType=media y el nombre en la query', async () => {
    const fetchSpy = mockFetch(() => new Response('{}', { status: 200 }))

    await subirArchivo({ apiKey: 'key-subir-1', projectId: 'proj' }, 'mi-bucket', 'respaldos/centro/x.db', Buffer.from('hola'))

    const llamada = fetchSpy.mock.calls.find(([input]) => !String(input).includes('identitytoolkit'))
    expect(llamada).toBeDefined()
    const [url, opciones] = llamada!
    expect(String(url)).toContain('uploadType=media')
    expect(String(url)).toContain(encodeURIComponent('respaldos/centro/x.db'))
    expect((opciones as RequestInit).method).toBe('POST')
    expect((opciones as RequestInit).body).toEqual(new Uint8Array(Buffer.from('hola')))
  })

  it('lanza si Storage responde con error', async () => {
    mockFetch(() => new Response('nope', { status: 500 }))

    await expect(
      subirArchivo({ apiKey: 'key-subir-2', projectId: 'proj' }, 'mi-bucket', 'respaldos/centro/x.db', Buffer.from('hola'))
    ).rejects.toThrow('500')
  })
})

describe('listarArchivos', () => {
  it('mapea los items de la respuesta a ArchivoStorage', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            items: [
              { name: 'respaldos/centro/a.db', size: '1024', updated: '2026-09-08T00:00:00.000Z' },
              { name: 'respaldos/centro/b.db', size: '2048', updated: '2026-09-09T00:00:00.000Z' }
            ]
          }),
          { status: 200 }
        )
    )

    const resultado = await listarArchivos({ apiKey: 'key-listar-1', projectId: 'proj' }, 'mi-bucket', 'respaldos/centro/')

    expect(resultado).toEqual([
      { nombre: 'respaldos/centro/a.db', tamanoBytes: 1024, actualizadoEn: '2026-09-08T00:00:00.000Z' },
      { nombre: 'respaldos/centro/b.db', tamanoBytes: 2048, actualizadoEn: '2026-09-09T00:00:00.000Z' }
    ])
  })

  it('devuelve vacío si no hay "items" en la respuesta', async () => {
    mockFetch(() => new Response('{}', { status: 200 }))

    const resultado = await listarArchivos({ apiKey: 'key-listar-2', projectId: 'proj' }, 'mi-bucket', 'respaldos/centro/')

    expect(resultado).toEqual([])
  })
})

describe('eliminarArchivo', () => {
  it('no lanza si el archivo ya no existía (404)', async () => {
    mockFetch(() => new Response('not found', { status: 404 }))

    await expect(
      eliminarArchivo({ apiKey: 'key-eliminar-1', projectId: 'proj' }, 'mi-bucket', 'respaldos/centro/x.db')
    ).resolves.toBeUndefined()
  })

  it('lanza si Storage responde con otro error', async () => {
    mockFetch(() => new Response('nope', { status: 500 }))

    await expect(
      eliminarArchivo({ apiKey: 'key-eliminar-2', projectId: 'proj' }, 'mi-bucket', 'respaldos/centro/x.db')
    ).rejects.toThrow('500')
  })
})

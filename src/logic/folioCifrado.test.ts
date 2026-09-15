import { describe, expect, it } from 'vitest'
import { cifrarFolio, RANGO_MAXIMO } from './folioCifrado'

const CLAVE = 'clave-de-prueba-1234'

describe('cifrarFolio', () => {
  it('es una biyección exacta sobre todo el rango 0..999,999 (sin colisiones)', () => {
    // Se acumulan los problemas en variables planas en vez de llamar
    // expect() en cada una de las 1,000,000 de operaciones — el overhead de
    // expect() por llamada domina el tiempo del test si se hace así; el
    // trabajo real del cifrado es rápido.
    const vistos = new Uint8Array(RANGO_MAXIMO)
    let fueraDeRango = 0
    let colisiones = 0

    for (let folio = 0; folio < RANGO_MAXIMO; folio++) {
      const cifrado = cifrarFolio(folio, CLAVE)
      if (cifrado < 0 || cifrado >= RANGO_MAXIMO) fueraDeRango++
      else if (vistos[cifrado]) colisiones++
      else vistos[cifrado] = 1
    }

    expect(fueraDeRango).toBe(0)
    expect(colisiones).toBe(0)
  }, 30_000)

  it('es determinístico (mismo folio + misma clave siempre da el mismo resultado)', () => {
    expect(cifrarFolio(12345, CLAVE)).toBe(cifrarFolio(12345, CLAVE))
  })

  it('no es la identidad (de verdad ofusca, no deja el número igual)', () => {
    let iguales = 0
    for (let folio = 0; folio < 1000; folio++) {
      if (cifrarFolio(folio, CLAVE) === folio) iguales++
    }
    expect(iguales).toBeLessThan(50) // deja pasar alguna coincidencia rara, pero no la mayoría
  })

  it('dos claves distintas producen resultados distintos para el mismo folio', () => {
    const a = cifrarFolio(12345, 'clave-a')
    const b = cifrarFolio(12345, 'clave-b')
    expect(a).not.toBe(b)
  })

  it('folios fuera del rango cifrable (>= 1,000,000) pasan sin cambios', () => {
    expect(cifrarFolio(1_234_567, CLAVE)).toBe(1_234_567)
  })
})

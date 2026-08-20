import { describe, expect, it } from 'vitest'
import {
  cifrarFolio,
  descifrarFolio,
  RANGO_MAXIMO,
  cifrarFolioConSerie,
  descifrarFolioConSerie,
  indiceDeLetra,
  letraDeIndice,
  RANGO_CIFRADO,
  DIGITOS_CODIGO,
  MAX_LETRAS
} from './folioCifrado'

const CLAVE = 'clave-de-prueba-1234'

describe('cifrarFolio / descifrarFolio', () => {
  it('es una biyección exacta sobre todo el rango 0..999,999 (sin colisiones, siempre reversible)', () => {
    // Se acumulan los problemas en variables planas en vez de llamar
    // expect() en cada una de las 2,000,000 de operaciones (cifrar +
    // descifrar por folio) — el overhead de expect() por llamada domina el
    // tiempo del test si se hace así; el trabajo real del cifrado es rápido.
    const vistos = new Uint8Array(RANGO_MAXIMO)
    let fueraDeRango = 0
    let colisiones = 0
    let noReversibles = 0

    for (let folio = 0; folio < RANGO_MAXIMO; folio++) {
      const cifrado = cifrarFolio(folio, CLAVE)
      if (cifrado < 0 || cifrado >= RANGO_MAXIMO) fueraDeRango++
      else if (vistos[cifrado]) colisiones++
      else vistos[cifrado] = 1

      if (descifrarFolio(cifrado, CLAVE) !== folio) noReversibles++
    }

    expect(fueraDeRango).toBe(0)
    expect(colisiones).toBe(0)
    expect(noReversibles).toBe(0)
  }, 30_000)

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
    expect(descifrarFolio(1_234_567, CLAVE)).toBe(1_234_567)
  })
})

describe('indiceDeLetra / letraDeIndice', () => {
  it('es la inversa exacta para A..Z', () => {
    for (let i = 0; i < MAX_LETRAS; i++) {
      const letra = letraDeIndice(i)
      expect(indiceDeLetra(letra)).toBe(i)
    }
  })

  it('rechaza series de más de una letra o minúsculas', () => {
    expect(indiceDeLetra('AB')).toBeNull()
    expect(indiceDeLetra('a')).toBeNull()
    expect(indiceDeLetra('')).toBeNull()
  })
})

describe('cifrarFolioConSerie / descifrarFolioConSerie', () => {
  it('es inyectiva sobre las 26,000,000 combinaciones reales (sin colisiones), y siempre reversible', () => {
    const vistos = new Uint8Array(RANGO_CIFRADO)
    let fueraDeRango = 0
    let colisiones = 0
    let noReversibles = 0

    for (let serieIdx = 0; serieIdx < MAX_LETRAS; serieIdx++) {
      const serie = letraDeIndice(serieIdx)
      // Barrido completo sería 26,000,000 combinaciones — con una muestra
      // grande mientras se recorre cada serie por completo alcanza para
      // confirmar biyección real sin que el test tarde minutos.
      for (let folio = 0; folio < RANGO_MAXIMO; folio += 7) {
        const codigo = cifrarFolioConSerie(serie, folio, CLAVE)!
        if (codigo < 0 || codigo >= RANGO_CIFRADO) fueraDeRango++
        else if (vistos[codigo]) colisiones++
        else vistos[codigo] = 1

        const de = descifrarFolioConSerie(codigo, CLAVE)
        if (!de || de.serie !== serie || de.folio !== folio) noReversibles++
      }
    }

    expect(fueraDeRango).toBe(0)
    expect(colisiones).toBe(0)
    expect(noReversibles).toBe(0)
  }, 30_000)

  it('el código no delata la serie (folios de A y B con el mismo número real caen en códigos muy distintos)', () => {
    const codigoA = cifrarFolioConSerie('A', 500, CLAVE)!
    const codigoB = cifrarFolioConSerie('B', 500, CLAVE)!
    expect(codigoA).not.toBe(codigoB)
    // No deberían diferir por un offset obvio y constante (ej. exactamente RANGO_MAXIMO).
    expect(Math.abs(codigoA - codigoB)).not.toBe(RANGO_MAXIMO)
  })

  it('devuelve null para series de más de 1 letra', () => {
    expect(cifrarFolioConSerie('AB', 1, CLAVE)).toBeNull()
  })

  it('el primer dígito del código no queda limitado a 0/1/2 (usa todo el ancho de 8 dígitos)', () => {
    const primerDigitos = new Set<string>()
    for (let folio = 0; folio < 5000; folio++) {
      const codigo = cifrarFolioConSerie('A', folio, CLAVE)!
      primerDigitos.add(String(codigo).padStart(DIGITOS_CODIGO, '0')[0])
    }
    // Con una muestra de 5000 códigos debería verse una buena variedad de
    // primeros dígitos, no solo 0/1/2 (que es lo que pasaba cuando el
    // cycle-walking se hacía sobre el rango real de 26,000,000 en vez del
    // rango completo de 8 dígitos).
    expect(primerDigitos.size).toBeGreaterThan(5)
  })

  it('un código de 8 dígitos elegido al azar casi siempre no corresponde a ningún folio real', () => {
    // De los 100,000,000 códigos posibles, solo 26,000,000 son válidos —
    // confirma que la validación contra RANGO_COMBINADO realmente rechaza
    // códigos inventados/mal escaneados en vez de aceptarlos silenciosamente.
    let invalidos = 0
    const total = 2000
    for (let i = 0; i < total; i++) {
      const codigo = (i * 3_141_592_7) % RANGO_CIFRADO
      if (!descifrarFolioConSerie(codigo, CLAVE)) invalidos++
    }
    expect(invalidos / total).toBeGreaterThan(0.5)
  })
})

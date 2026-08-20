import { describe, expect, it } from 'vitest'
import { formatearFolio, parsearFolio } from './folioBarcode'

const CLAVE = 'clave-de-prueba'

describe('formatearFolio', () => {
  it('devuelve un código puramente numérico (sin letra ni guion) para series de 1 letra', () => {
    expect(formatearFolio('A', 1, CLAVE)).toMatch(/^\d{8}$/)
    expect(formatearFolio('B', 42, CLAVE)).toMatch(/^\d{8}$/)
  })

  it('el número mostrado no es el folio real ni delata la serie', () => {
    expect(formatearFolio('A', 1, CLAVE)).not.toBe('A-000001')
    // Mismo folio real, distinta serie -> códigos distintos.
    expect(formatearFolio('A', 500, CLAVE)).not.toBe(formatearFolio('B', 500, CLAVE))
  })

  it('series de más de 1 letra (caso raro, no usado en la práctica) usan el formato de respaldo con letra visible', () => {
    expect(formatearFolio('AB', 1234567, CLAVE)).toBe('AB-1234567')
  })
})

describe('parsearFolio', () => {
  it('es la inversa exacta de formatearFolio (recupera serie y folio reales)', () => {
    const texto = formatearFolio('B', 7, CLAVE)
    expect(parsearFolio(texto, CLAVE)).toEqual({ serie: 'B', folio: 7 })
  })

  it('acepta espacios sobrantes (tolerante a variaciones del escáner)', () => {
    const texto = formatearFolio('A', 42, CLAVE)
    expect(parsearFolio(` ${texto} \n`, CLAVE)).toEqual({ serie: 'A', folio: 42 })
  })

  it('con la clave equivocada no recupera el folio/serie reales', () => {
    const texto = formatearFolio('A', 999, CLAVE)
    const resultado = parsearFolio(texto, 'otra-clave')
    expect(resultado?.folio === 999 && resultado?.serie === 'A').toBe(false)
  })

  it('devuelve null con texto que no matchea ningún formato válido', () => {
    expect(parsearFolio('', CLAVE)).toBeNull()
    expect(parsearFolio('A000123', CLAVE)).toBeNull()
    expect(parsearFolio('A-', CLAVE)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { formatearFolio, parsearFolio } from './folioBarcode'

describe('formatearFolio', () => {
  it('rellena el folio a 6 dígitos', () => {
    expect(formatearFolio('A', 1)).toBe('A-000001')
    expect(formatearFolio('B', 42)).toBe('B-000042')
  })

  it('no trunca folios de más de 6 dígitos', () => {
    expect(formatearFolio('A', 1234567)).toBe('A-1234567')
  })
})

describe('parsearFolio', () => {
  it('reconstruye serie y folio desde el texto formateado', () => {
    expect(parsearFolio('A-000001')).toEqual({ serie: 'A', folio: 1 })
  })

  it('acepta minúsculas y espacios sobrantes (tolerante a variaciones del escáner)', () => {
    expect(parsearFolio(' a-000042 \n')).toEqual({ serie: 'A', folio: 42 })
  })

  it('es la inversa exacta de formatearFolio', () => {
    const texto = formatearFolio('B', 7)
    expect(parsearFolio(texto)).toEqual({ serie: 'B', folio: 7 })
  })

  it('devuelve null con texto que no matchea el formato', () => {
    expect(parsearFolio('')).toBeNull()
    expect(parsearFolio('000123')).toBeNull()
    expect(parsearFolio('A000123')).toBeNull()
    expect(parsearFolio('A-')).toBeNull()
  })
})

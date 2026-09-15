import { describe, expect, it } from 'vitest'
import {
  formatearCodigoFacturacionBoleto,
  formatearCodigoPago,
  formatearFolioImpreso,
  formatearFolioPlano,
  parsearFolioImpreso
} from './folioBarcode'

const CLAVE = 'clave-de-prueba'

describe('formatearFolioImpreso', () => {
  it('antepone el marcador al folio real, sin cifrar, a 6 dígitos', () => {
    expect(formatearFolioImpreso('*', 'A', 1)).toBe('*000001')
    expect(formatearFolioImpreso('#', 'B', 42)).toBe('#000042')
  })

  it('el folio mostrado ES el folio real (requisito SAT: sin cifrar)', () => {
    expect(formatearFolioImpreso('*', 'A', 184)).toBe('*000184')
  })

  it('sin marcador (serie borrada con boleto todavía abierto), cae al formato con la letra visible', () => {
    expect(formatearFolioImpreso(null, 'A', 1)).toBe('A-000001')
  })
})

describe('parsearFolioImpreso', () => {
  it('es la inversa exacta de formatearFolioImpreso (recupera marcador y folio)', () => {
    const texto = formatearFolioImpreso('#', 'B', 7)
    expect(parsearFolioImpreso(texto)).toEqual({ marcador: '#', folio: 7 })
  })

  it('acepta espacios sobrantes (tolerante a variaciones del escáner)', () => {
    const texto = formatearFolioImpreso('*', 'A', 42)
    expect(parsearFolioImpreso(` ${texto} \n`)).toEqual({ marcador: '*', folio: 42 })
  })

  it('el marcador nunca es un dígito — no confunde un folio puro con "marcador 0"', () => {
    expect(parsearFolioImpreso('000184')).toBeNull()
  })

  it('devuelve null con texto que no matchea ningún formato válido', () => {
    expect(parsearFolioImpreso('')).toBeNull()
    expect(parsearFolioImpreso('*')).toBeNull()
    expect(parsearFolioImpreso('**000184')).toBeNull()
  })
})

describe('formatearFolioPlano', () => {
  it('serie-folio, sin marcador, para pantallas internas (Corte de caja, Boletos abiertos)', () => {
    expect(formatearFolioPlano('A', 1)).toBe('A-000001')
    expect(formatearFolioPlano('B', 42)).toBe('B-000042')
  })
})

describe('formatearCodigoPago', () => {
  it('siempre lleva el prefijo "MEN-", distinto a "BOL-" de formatearCodigoFacturacionBoleto', () => {
    expect(formatearCodigoPago(1, CLAVE)).toMatch(/^MEN-\d{6}$/)
  })

  it('no delata el id real del pago', () => {
    expect(formatearCodigoPago(1, CLAVE)).not.toBe('MEN-000001')
  })

  it('el mismo pago siempre da el mismo código (determinista) con la misma clave', () => {
    expect(formatearCodigoPago(42, CLAVE)).toBe(formatearCodigoPago(42, CLAVE))
  })

  it('pagos distintos dan códigos distintos', () => {
    expect(formatearCodigoPago(1, CLAVE)).not.toBe(formatearCodigoPago(2, CLAVE))
  })
})

describe('formatearCodigoFacturacionBoleto', () => {
  it('siempre lleva el prefijo "BOL-", distinto a "MEN-" de formatearCodigoPago', () => {
    expect(formatearCodigoFacturacionBoleto(1, CLAVE)).toMatch(/^BOL-\d{6}$/)
  })

  it('no delata el id real del boleto', () => {
    expect(formatearCodigoFacturacionBoleto(1, CLAVE)).not.toBe('BOL-000001')
  })

  it('el mismo boleto siempre da el mismo código (determinista) con la misma clave', () => {
    expect(formatearCodigoFacturacionBoleto(42, CLAVE)).toBe(formatearCodigoFacturacionBoleto(42, CLAVE))
  })

  it('boletos distintos dan códigos distintos', () => {
    expect(formatearCodigoFacturacionBoleto(1, CLAVE)).not.toBe(formatearCodigoFacturacionBoleto(2, CLAVE))
  })

  it('está desacoplado del folio impreso — cifra el id local del boleto, no serie+folio', () => {
    // Dos boletos con el mismo folio visible (series/marcadores distintos)
    // deben dar códigos de facturación distintos si sus ids locales lo son.
    const codigoBoleto1 = formatearCodigoFacturacionBoleto(1, CLAVE)
    const codigoBoleto2 = formatearCodigoFacturacionBoleto(2, CLAVE)
    expect(codigoBoleto1).not.toBe(codigoBoleto2)
  })
})

import { describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'
import { formatearFolio } from '../logic/folioBarcode'
import { construirTicketCobro, construirTicketEntrada, construirTicketPensionado } from './escpos'

const CLAVE_FOLIO = 'clave-de-prueba'

describe('construirTicketEntrada', () => {
  const datosBase = {
    estacionamientoNombre: 'Estación Central',
    textoBoleto: null,
    serie: 'A',
    folio: 176,
    tipoVehiculo: 'Auto',
    placa: null,
    horaEntrada: '2026-09-01T12:00:00.000Z',
    tarifaPlana: null
  }

  it('empieza con el comando de inicio (ESC @) y selección de código de página', () => {
    const buffer = construirTicketEntrada(datosBase, CLAVE_FOLIO)
    expect(buffer.subarray(0, 5)).toEqual(Buffer.from([0x1b, 0x40, 0x1b, 0x74, 2]))
  })

  it('el nombre del estacionamiento va centrado y en negritas', () => {
    const buffer = construirTicketEntrada(datosBase, CLAVE_FOLIO)
    // ESC a 1 (centrado) seguido de ESC E 1 (negritas) antes del texto codificado.
    const centradoYNegritas = Buffer.from([0x1b, 0x61, 1, 0x1b, 0x45, 1])
    expect(buffer.indexOf(centradoYNegritas)).toBe(5)
  })

  it('codifica acentos/ñ en CP850, no en UTF-8 crudo', () => {
    const buffer = construirTicketEntrada({ ...datosBase, estacionamientoNombre: 'Peñón' }, CLAVE_FOLIO)
    const enCp850 = iconv.encode('Peñón', 'cp850')
    const enUtf8 = Buffer.from('Peñón', 'utf8')
    expect(buffer.indexOf(enCp850)).toBeGreaterThanOrEqual(0)
    // El acento en UTF-8 usa 2 bytes por carácter — no debería aparecer tal cual.
    expect(enCp850.equals(enUtf8)).toBe(false)
  })

  it('incluye el folio (ya formateado/cifrado) en texto y en el comando de barcode', () => {
    const buffer = construirTicketEntrada(datosBase, CLAVE_FOLIO)
    const textoFolio = formatearFolio(datosBase.serie, datosBase.folio, CLAVE_FOLIO)

    expect(buffer.indexOf(Buffer.from(`Folio: ${textoFolio}`, 'ascii'))).toBeGreaterThanOrEqual(0)

    // GS k 73 n {B<folio> — comando nativo de barcode CODE128.
    const datosBarcode = Buffer.concat([Buffer.from('{B', 'ascii'), Buffer.from(textoFolio, 'ascii')])
    const comandoBarcode = Buffer.concat([Buffer.from([0x1d, 0x6b, 73, datosBarcode.length]), datosBarcode])
    expect(buffer.indexOf(comandoBarcode)).toBeGreaterThanOrEqual(0)
  })

  it('incluye Vehículo/Placa/Entrada y termina con el comando de corte (GS V 0)', () => {
    const buffer = construirTicketEntrada({ ...datosBase, placa: 'ABC-123' }, CLAVE_FOLIO)
    expect(buffer.indexOf(Buffer.from('Vehículo: Auto', 'utf8'))).toBe(-1) // no debe ir en UTF-8 crudo
    expect(buffer.indexOf(iconv.encode('Vehículo: Auto', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Placa: ABC-123', 'cp850'))).toBeGreaterThanOrEqual(0)

    // GS V 66 n — avanza el papel y corta (más confiable que cortar sin avanzar).
    const corte = Buffer.from([0x1d, 0x56, 66, 50])
    expect(buffer.subarray(buffer.length - 4)).toEqual(corte)
  })

  it('sin placa, no imprime la línea de placa', () => {
    const buffer = construirTicketEntrada(datosBase, CLAVE_FOLIO)
    expect(buffer.indexOf(iconv.encode('Placa:', 'cp850'))).toBe(-1)
  })
})

describe('construirTicketCobro', () => {
  const datosBase = {
    estacionamientoNombre: 'Estación Central',
    textoBoleto: null,
    serie: 'A',
    folio: 176,
    tipoCobro: 'regular' as const,
    minutosTotales: 60,
    monto: 40
  }

  it('cobro regular: muestra el tiempo y el monto sin recargo aparte', () => {
    const buffer = construirTicketCobro(datosBase, CLAVE_FOLIO)
    expect(buffer.indexOf(iconv.encode('Tiempo: 60 min — $40.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Total: $40.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('con recargo de boleto perdido: lo desglosa aparte del cálculo normal', () => {
    const buffer = construirTicketCobro({ ...datosBase, monto: 90, recargoBoletoPerdido: 50 }, CLAVE_FOLIO)
    // El desglose de tiempo es sobre el monto SIN el recargo (90 - 50 = 40).
    expect(buffer.indexOf(iconv.encode('Tiempo: 60 min — $40.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Recargo boleto perdido: $50.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Total: $90.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('tarifa plana: desglosa el fijo y el excedente', () => {
    const buffer = construirTicketCobro(
      { ...datosBase, tipoCobro: 'plana', monto: 120, excedenteMinutos: 60, excedenteMonto: 40 },
      CLAVE_FOLIO
    )
    expect(buffer.indexOf(iconv.encode('Tarifa plana: $80.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Excedente: 60 min — $40.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })
})

describe('construirTicketPensionado', () => {
  const datosBase = {
    tipo: 'pago' as const,
    folio: 12,
    estacionamientoNombre: 'Estación Central',
    nombre: 'Juan Pérez',
    placa: 'XYZ-987',
    tipoVehiculo: 'Auto',
    fecha: '2026-09-01T12:00:00.000Z',
    monto: 500,
    periodoDesde: '2026-09-01T00:00:00.000Z',
    periodoHasta: '2026-09-30T00:00:00.000Z'
  }

  it('folio de pensionado lleva el prefijo P-', () => {
    const buffer = construirTicketPensionado(datosBase)
    expect(buffer.indexOf(iconv.encode('Folio: P-12', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('pago: muestra el periodo y el monto pagado', () => {
    const buffer = construirTicketPensionado(datosBase)
    expect(buffer.indexOf(iconv.encode('Monto pagado: $500.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('alta: muestra la cuota mensual en vez del periodo/monto', () => {
    const buffer = construirTicketPensionado({ ...datosBase, tipo: 'alta', cuotaMensual: 800, monto: undefined })
    expect(buffer.indexOf(iconv.encode('Cuota mensual: $800.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Monto pagado:', 'cp850'))).toBe(-1)
  })

  it('sin placa, muestra un guion largo', () => {
    const buffer = construirTicketPensionado({ ...datosBase, placa: null })
    expect(buffer.indexOf(iconv.encode('Placa: —', 'cp850'))).toBeGreaterThanOrEqual(0)
  })
})

import { describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'
import { formatearFolio } from '../logic/folioBarcode'
import {
  construirReporteCorte,
  construirReporteCorteMensual,
  construirReporteCorteSerie,
  construirTicketCobro,
  construirTicketEntrada,
  construirTicketPensionado
} from './escpos'
import { ESQUEMA_COCHE_ALTO, ESQUEMA_COCHE_ANCHO } from './escposEsquemaCoche'

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

  it('empieza con el comando de inicio (ESC @), selección de código de página y una línea en blanco de sacrificio', () => {
    const buffer = construirTicketEntrada(datosBase, CLAVE_FOLIO)
    // ESC @, ESC t 2 (tabla CP850), 0x0A (línea en blanco para el buffer de la térmica).
    expect(buffer.subarray(0, 6)).toEqual(Buffer.from([0x1b, 0x40, 0x1b, 0x74, 2, 0x0a]))
  })

  it('el nombre del estacionamiento va centrado y en negritas', () => {
    const buffer = construirTicketEntrada(datosBase, CLAVE_FOLIO)
    // ESC a 1 (centrado) seguido de ESC E 1 (negritas) antes del texto codificado.
    const centradoYNegritas = Buffer.from([0x1b, 0x61, 1, 0x1b, 0x45, 1])
    expect(buffer.indexOf(centradoYNegritas)).toBe(6)
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

  it('incluye el esquema del coche como imagen rasterizada (GS v 0) antes del corte', () => {
    const buffer = construirTicketEntrada(datosBase, CLAVE_FOLIO)
    const anchoBytes = Math.ceil(ESQUEMA_COCHE_ANCHO / 8)
    // GS v 0 m xL xH yL yH — xL/xH es el ancho EN BYTES, yL/yH el alto en puntos.
    const encabezadoImagen = Buffer.from([
      0x1d,
      0x76,
      0x30,
      0,
      anchoBytes & 0xff,
      (anchoBytes >> 8) & 0xff,
      ESQUEMA_COCHE_ALTO & 0xff,
      (ESQUEMA_COCHE_ALTO >> 8) & 0xff
    ])
    const posicionImagen = buffer.indexOf(encabezadoImagen)
    expect(posicionImagen).toBeGreaterThanOrEqual(0)

    // Los datos de la imagen (anchoBytes * alto) deben caber antes del corte.
    const finImagen = posicionImagen + encabezadoImagen.length + anchoBytes * ESQUEMA_COCHE_ALTO
    expect(buffer.indexOf(Buffer.from([0x1d, 0x56, 66]), finImagen)).toBeGreaterThanOrEqual(finImagen)
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
    expect(buffer.indexOf(iconv.encode('Tiempo: 60 min - $40.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Total: $40.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('con recargo de boleto perdido: lo desglosa aparte del cálculo normal', () => {
    const buffer = construirTicketCobro({ ...datosBase, monto: 90, recargoBoletoPerdido: 50 }, CLAVE_FOLIO)
    // El desglose de tiempo es sobre el monto SIN el recargo (90 - 50 = 40).
    expect(buffer.indexOf(iconv.encode('Tiempo: 60 min - $40.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Recargo boleto perdido: $50.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Total: $90.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('tarifa plana: desglosa el fijo y el excedente', () => {
    const buffer = construirTicketCobro(
      { ...datosBase, tipoCobro: 'plana', monto: 120, excedenteMinutos: 60, excedenteMonto: 40 },
      CLAVE_FOLIO
    )
    expect(buffer.indexOf(iconv.encode('Tarifa plana: $80.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Excedente: 60 min - $40.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('no usa el guion largo "—" (CP850 no lo tiene, sale como "?" en la impresora)', () => {
    const buffer = construirTicketCobro(
      { ...datosBase, tipoCobro: 'plana', monto: 120, excedenteMinutos: 60, excedenteMonto: 40 },
      CLAVE_FOLIO
    )
    // 0x3F es el caracter de reemplazo ('?') que usa iconv-lite cuando el
    // texto original tiene algo que la tabla CP850 no puede representar.
    expect(buffer.includes(Buffer.from([0x3f]))).toBe(false)
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

  it('sin placa, muestra un guion (no el guion largo, sale como "?" en CP850)', () => {
    const buffer = construirTicketPensionado({ ...datosBase, placa: null })
    expect(buffer.indexOf(iconv.encode('Placa: -', 'cp850'))).toBeGreaterThanOrEqual(0)
  })
})

describe('construirReporteCorte', () => {
  const datosBase = {
    estacionamientoNombre: 'Estación Central',
    generadoPor: 'admin',
    soloSerieA: false,
    desde: '2026-09-01T00:00:00.000Z',
    hasta: '2026-09-01T23:59:59.000Z',
    porTipoVehiculo: [{ tipoVehiculo: 'Auto', boletos: 10, monto: 400 }],
    altasPensionados: [] as string[],
    bajasPensionados: [] as string[],
    pagosPensionados: [] as { pensionadoNombre: string; monto: number }[],
    gastosDelPeriodo: [] as { concepto: string; monto: number }[],
    totalBoletos: 10,
    totalMonto: 400,
    pensionadosPagosCantidad: 0,
    pensionadosPagosMonto: 0,
    gastosEfectivoCantidad: 0,
    gastosEfectivoMonto: 0
  }

  it('incluye el nombre, el periodo y el desglose por tipo de vehículo', () => {
    const buffer = construirReporteCorte(datosBase)
    expect(buffer.indexOf(iconv.encode('Corte de caja', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Auto: 10 - $400.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('calcula el total en caja (boletos + pensionados - gastos)', () => {
    const buffer = construirReporteCorte({
      ...datosBase,
      pagosPensionados: [{ pensionadoNombre: 'Juan Pérez', monto: 500 }],
      pensionadosPagosCantidad: 1,
      pensionadosPagosMonto: 500,
      gastosDelPeriodo: [{ concepto: 'Papel térmico', monto: 100 }],
      gastosEfectivoCantidad: 1,
      gastosEfectivoMonto: 100
    })
    // 400 + 500 - 100 = 800
    expect(buffer.indexOf(iconv.encode('TOTAL EN CAJA: $800.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Juan Pérez: $500.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Papel térmico: $100.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('sin pensionados ni gastos en el periodo, no imprime esas secciones', () => {
    const buffer = construirReporteCorte(datosBase)
    expect(buffer.indexOf(iconv.encode('Pensionados:', 'cp850'))).toBe(-1)
    expect(buffer.indexOf(iconv.encode('Gastos:', 'cp850'))).toBe(-1)
  })

  it('termina con el comando de corte', () => {
    const buffer = construirReporteCorte(datosBase)
    const corte = Buffer.from([0x1d, 0x56, 66, 50])
    expect(buffer.subarray(buffer.length - 4)).toEqual(corte)
  })

  it('no usa el guion largo "—" en ningún texto', () => {
    const buffer = construirReporteCorte({
      ...datosBase,
      altasPensionados: ['Ana'],
      bajasPensionados: ['Luis'],
      pagosPensionados: [{ pensionadoNombre: 'Juan Pérez', monto: 500 }],
      gastosDelPeriodo: [{ concepto: 'Papel térmico', monto: 100 }]
    })
    expect(buffer.includes(Buffer.from([0x3f]))).toBe(false)
  })
})

describe('construirReporteCorteSerie', () => {
  const datosBase = {
    estacionamientoNombre: 'Estación Central',
    generadoPor: 'admin',
    serie: 'A',
    desde: '2026-09-01T00:00:00.000Z',
    hasta: '2026-09-01T23:59:59.000Z',
    boletos: [
      {
        serie: 'A',
        folio: 176,
        tipoVehiculo: 'Auto',
        horaEntrada: '2026-09-01T12:00:00.000Z',
        horaSalida: '2026-09-01T13:30:00.000Z',
        monto: 40
      }
    ],
    totalBoletos: 1,
    totalMonto: 40
  }

  it('incluye el folio (formateado con formatearFolio) de cada boleto y el total de la serie', () => {
    const buffer = construirReporteCorteSerie(datosBase, CLAVE_FOLIO)
    const folioTexto = formatearFolio('A', 176, CLAVE_FOLIO)
    expect(buffer.indexOf(iconv.encode(folioTexto, 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Total serie A: 1 boletos, $40.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('termina con el comando de corte', () => {
    const buffer = construirReporteCorteSerie(datosBase, CLAVE_FOLIO)
    const corte = Buffer.from([0x1d, 0x56, 66, 50])
    expect(buffer.subarray(buffer.length - 4)).toEqual(corte)
  })

  it('no usa el guion largo "—" en ningún texto', () => {
    const buffer = construirReporteCorteSerie(datosBase, CLAVE_FOLIO)
    expect(buffer.includes(Buffer.from([0x3f]))).toBe(false)
  })
})

describe('construirReporteCorteMensual', () => {
  const datosBase = {
    estacionamientoNombre: 'Estación Central',
    anio: 2026,
    mes: 9,
    totalBoletos: 300,
    totalMonto: 12000,
    pensionadosPagosCantidad: 0,
    pensionadosPagosMonto: 0,
    altasPensionados: [] as string[],
    bajasPensionados: [] as string[],
    gastosEfectivoCantidad: 0,
    gastosEfectivoMonto: 0,
    gastosPorCategoria: [] as { categoria: string; cantidad: number; monto: number }[],
    totalEnCaja: 12000,
    cortesDelMes: [] as { hasta: string; totalBoletos: number; totalMonto: number }[]
  }

  it('incluye el nombre del mes/año y los totales', () => {
    const buffer = construirReporteCorteMensual(datosBase)
    expect(buffer.indexOf(iconv.encode('Corte mensual - Septiembre 2026', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('Boletos: 300 - $12000.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('TOTAL EN CAJA DEL MES: $12000.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('incluye gastos por categoría y los cortes de turno del mes', () => {
    const buffer = construirReporteCorteMensual({
      ...datosBase,
      gastosPorCategoria: [{ categoria: 'Papelería', cantidad: 2, monto: 150 }],
      gastosEfectivoCantidad: 1,
      gastosEfectivoMonto: 100,
      cortesDelMes: [{ hasta: '2026-09-01T23:59:59.000Z', totalBoletos: 10, totalMonto: 400 }]
    })
    expect(buffer.indexOf(iconv.encode('Papelería: 2 - $150.00', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('(Efectivo: 1 - $100.00)', 'cp850'))).toBeGreaterThanOrEqual(0)
    expect(buffer.indexOf(iconv.encode('10 bol.  $400.00', 'cp850'))).toBeGreaterThanOrEqual(0)
  })

  it('sin pensionados ni gastos ni cortes en el mes, no imprime esas secciones', () => {
    const buffer = construirReporteCorteMensual(datosBase)
    expect(buffer.indexOf(iconv.encode('Pensionados:', 'cp850'))).toBe(-1)
    expect(buffer.indexOf(iconv.encode('Gastos por categoria:', 'cp850'))).toBe(-1)
    expect(buffer.indexOf(iconv.encode('Cortes de turno del mes:', 'cp850'))).toBe(-1)
  })

  it('termina con el comando de corte', () => {
    const buffer = construirReporteCorteMensual(datosBase)
    const corte = Buffer.from([0x1d, 0x56, 66, 50])
    expect(buffer.subarray(buffer.length - 4)).toEqual(corte)
  })

  it('no usa el guion largo "—" en ningún texto', () => {
    const buffer = construirReporteCorteMensual({
      ...datosBase,
      altasPensionados: ['Ana'],
      bajasPensionados: ['Luis'],
      pensionadosPagosCantidad: 2,
      pensionadosPagosMonto: 1000,
      gastosPorCategoria: [{ categoria: 'Papelería', cantidad: 2, monto: 150 }],
      cortesDelMes: [{ hasta: '2026-09-01T23:59:59.000Z', totalBoletos: 10, totalMonto: 400 }]
    })
    expect(buffer.includes(Buffer.from([0x3f]))).toBe(false)
  })
})

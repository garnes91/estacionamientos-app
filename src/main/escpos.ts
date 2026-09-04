import iconv from 'iconv-lite'
import { formatearFolio } from '../logic/folioBarcode'
import { ESQUEMA_COCHE_ALTO, ESQUEMA_COCHE_ANCHO, ESQUEMA_COCHE_DATOS_BASE64 } from './escposEsquemaCoche'

/**
 * Construye los bytes ESC/POS de un ticket para mandarlos crudos (ver
 * src/main/escposUsb.ts en Mac/Linux, src/main/escposWindows.ts en
 * Windows) — sin pasar por el sistema de impresión gráfico, para
 * impresoras cuyo driver no se puede instalar (ver plan de esta sesión:
 * certificado no confiable, Secure Boot, Zadig bloqueado, etc.).
 *
 * Reusa las mismas interfaces de datos que ya arman los componentes React
 * imprimibles (DatosBoletoImprimible, DatosReciboCobro,
 * DatosTicketPensionado) — este archivo es JS puro, sin dependencias de
 * Electron/USB, así que se puede probar sin hardware (ver escpos.test.ts).
 */

// Código de página CP850 (Multilingual) — cubre acentos y ñ del español.
// El número exacto de tabla de código ("ESC t n") varía un poco entre
// clones ESC/POS; 2 es el valor común en la mayoría (incluida la familia
// Epson TM-T88, que muchos clones imitan). Si el clon del usuario usa otro
// número, es el primer valor a ajustar.
const TABLA_CODIGO_CP850 = 2

const ESC = 0x1b
const GS = 0x1d

/**
 * Comando de inicio (reset + tabla de código) + una línea en blanco de
 * sacrificio. Reportado en hardware real: a veces se pierde el primer
 * milímetro del encabezado (el cabezal/buffer de la térmica no arranca
 * listo justo con los primeros bytes de un trabajo nuevo) — igual que ya
 * pasaba en el camino HTML viejo (ver el comentario de "relleno" en
 * src/main/print.ts), se sacrifica una línea en blanco al inicio para que
 * ese ruido caiga ahí y no sobre el nombre/folio real.
 */
function iniciar(): Buffer {
  return Buffer.concat([Buffer.from([ESC, 0x40, ESC, 0x74, TABLA_CODIGO_CP850]), saltoLinea()])
}

function negritas(activar: boolean): Buffer {
  return Buffer.from([ESC, 0x45, activar ? 1 : 0])
}

type Alineacion = 'izquierda' | 'centro'

function alinear(alineacion: Alineacion): Buffer {
  return Buffer.from([ESC, 0x61, alineacion === 'centro' ? 1 : 0])
}

function saltoLinea(): Buffer {
  return Buffer.from([0x0a])
}

interface OpcionesTexto {
  negrita?: boolean
  centrado?: boolean
}

/** Una línea de texto (con su propio salto de línea al final). */
function texto(valor: string, opciones: OpcionesTexto = {}): Buffer {
  return Buffer.concat([
    alinear(opciones.centrado ? 'centro' : 'izquierda'),
    negritas(!!opciones.negrita),
    iconv.encode(valor, 'cp850'),
    saltoLinea()
  ])
}

/** Una línea horizontal simple (equivalente al <hr> de los tickets HTML). */
function linea(): Buffer {
  return texto('--------------------------------')
}

/**
 * Código de barras CODE128 con el folio legible debajo — mismo dato que ya
 * dibuja jsbarcode en BoletoImprimible.tsx/ReciboCobro.tsx, pero con el
 * comando nativo de la impresora en vez de rasterizar un SVG.
 */
function barcode(valor: string): Buffer {
  // CODE128 en ESC/POS necesita un prefijo de "code set" — {B es el set
  // alfanumérico (letras+dígitos+símbolos), el que le sirve al patrón de
  // folio actual (ver formatearFolio en src/logic/folioBarcode.ts).
  const datos = Buffer.concat([Buffer.from('{B', 'ascii'), Buffer.from(valor, 'ascii')])
  return Buffer.concat([
    alinear('centro'),
    Buffer.from([GS, 0x68, 80]), // GS h 80 — alto del barcode en puntos
    Buffer.from([GS, 0x77, 2]), // GS w 2 — ancho de módulo
    Buffer.from([GS, 0x48, 2]), // GS H 2 — texto legible debajo del barcode
    Buffer.from([GS, 0x66, 0]), // GS f 0 — fuente A para ese texto legible
    Buffer.from([GS, 0x6b, 73, datos.length]), // GS k 73 n — imprime CODE128
    datos,
    saltoLinea()
  ])
}

/**
 * Comando de imagen rasterizada (GS v 0) con el esquema del coche para
 * marcar daños — el mismo bitmap blanco/negro puro que ya se usa en la
 * vista HTML (ver src/renderer/binarizarImagen.ts), precalculado una sola
 * vez porque es un asset fijo que no cambia entre boletos (ver
 * src/main/escposEsquemaCoche.ts). "xL xH" del comando son el ancho EN
 * BYTES (no en puntos) — de ahí el ceil(ancho/8).
 */
function imagenEsquemaCoche(): Buffer {
  const datos = Buffer.from(ESQUEMA_COCHE_DATOS_BASE64, 'base64')
  const anchoBytes = Math.ceil(ESQUEMA_COCHE_ANCHO / 8)
  return Buffer.concat([
    alinear('centro'),
    Buffer.from([
      GS,
      0x76,
      0x30,
      0,
      anchoBytes & 0xff,
      (anchoBytes >> 8) & 0xff,
      ESQUEMA_COCHE_ALTO & 0xff,
      (ESQUEMA_COCHE_ALTO >> 8) & 0xff
    ]),
    datos
  ])
}

/**
 * Avanza el papel y corta (comando "feed and full cut" de ESC/POS: GS V 66 n).
 * El cortador queda varios mm abajo del cabezal de impresión — cortar sin
 * avanzar antes (como se hacía con GS V 0 + un par de saltos de línea)
 * corta encima o demasiado cerca de la última línea impresa.
 *
 * OJO: "n" NO son líneas de texto — son "unidades de movimiento vertical"
 * de la impresora (un paso del motor, normalmente una fracción de mm), así
 * que hace falta un valor bastante más alto de lo que parece a simple
 * vista para que se note como margen real. n=6 (probado en hardware real)
 * dejaba un margen casi imperceptible antes del corte.
 */
function cortar(avance = 50): Buffer {
  return Buffer.from([GS, 0x56, 66, avance])
}

export interface DatosBoletoImprimibleEscpos {
  estacionamientoNombre: string
  textoBoleto: string | null
  serie: string
  folio: number
  tipoVehiculo: string
  placa: string | null
  horaEntrada: string
  tarifaPlana?: { nombre: string; precioFijo: number; horasIncluidas: number } | null
}

export function construirTicketEntrada(datos: DatosBoletoImprimibleEscpos, claveFolio: string): Buffer {
  const textoFolio = formatearFolio(datos.serie, datos.folio, claveFolio)
  const partes: Buffer[] = [iniciar(), texto(datos.estacionamientoNombre, { centrado: true, negrita: true })]

  if (datos.textoBoleto) {
    for (const linea of datos.textoBoleto.split('\n')) {
      partes.push(texto(linea, { centrado: true }))
    }
  }

  partes.push(linea())
  partes.push(texto(`Folio: ${textoFolio}`))
  partes.push(texto(`Vehículo: ${datos.tipoVehiculo}`))
  if (datos.placa) partes.push(texto(`Placa: ${datos.placa}`))
  partes.push(texto(`Entrada: ${new Date(datos.horaEntrada).toLocaleString()}`))
  if (datos.tarifaPlana) {
    partes.push(
      texto(`Tarifa plana: ${datos.tarifaPlana.nombre} ($${datos.tarifaPlana.precioFijo}/${datos.tarifaPlana.horasIncluidas}h)`)
    )
  }
  partes.push(linea())
  partes.push(barcode(textoFolio))
  partes.push(linea())
  partes.push(texto('Marcar daños visibles al ingresar:', { centrado: true }))
  partes.push(imagenEsquemaCoche())
  partes.push(cortar())

  return Buffer.concat(partes)
}

export interface DatosReciboCobroEscpos {
  estacionamientoNombre: string
  textoBoleto: string | null
  serie: string
  folio: number
  tipoCobro: 'regular' | 'plana'
  minutosTotales: number
  monto: number
  excedenteMinutos?: number
  excedenteMonto?: number
  recargoBoletoPerdido?: number
}

export function construirTicketCobro(datos: DatosReciboCobroEscpos, claveFolio: string): Buffer {
  const textoFolio = formatearFolio(datos.serie, datos.folio, claveFolio)
  const recargoBoletoPerdido = datos.recargoBoletoPerdido ?? 0
  const montoSinRecargo = datos.monto - recargoBoletoPerdido
  const montoFijo = datos.tipoCobro === 'plana' ? montoSinRecargo - (datos.excedenteMonto ?? 0) : null

  const partes: Buffer[] = [iniciar(), texto(datos.estacionamientoNombre, { centrado: true, negrita: true })]

  if (datos.textoBoleto) {
    for (const linea of datos.textoBoleto.split('\n')) {
      partes.push(texto(linea, { centrado: true }))
    }
  }

  partes.push(linea())
  partes.push(texto('Recibo de pago', { centrado: true }))
  partes.push(texto(`Folio: ${textoFolio}`))
  partes.push(linea())

  if (datos.tipoCobro === 'regular') {
    partes.push(texto(`Tiempo: ${datos.minutosTotales} min - $${montoSinRecargo.toFixed(2)}`))
  } else {
    partes.push(texto(`Tarifa plana: $${(montoFijo ?? 0).toFixed(2)}`))
    if (datos.excedenteMinutos) {
      partes.push(texto(`Excedente: ${datos.excedenteMinutos} min - $${(datos.excedenteMonto ?? 0).toFixed(2)}`))
    }
  }
  if (recargoBoletoPerdido) {
    partes.push(texto(`Recargo boleto perdido: $${recargoBoletoPerdido.toFixed(2)}`))
  }
  partes.push(barcode(textoFolio))
  partes.push(linea())
  partes.push(texto(`Total: $${datos.monto.toFixed(2)}`, { negrita: true }))
  partes.push(cortar())

  return Buffer.concat(partes)
}

export interface DatosTicketPensionadoEscpos {
  tipo: 'alta' | 'baja' | 'pago'
  folio: number
  estacionamientoNombre: string
  nombre: string
  placa: string | null
  tipoVehiculo: string
  fecha: string
  cuotaMensual?: number
  monto?: number
  periodoDesde?: string
  periodoHasta?: string
}

const TITULOS_PENSIONADO: Record<DatosTicketPensionadoEscpos['tipo'], string> = {
  alta: 'Alta de pensionado',
  baja: 'Baja de pensionado',
  pago: 'Recibo de pago - pensionado'
}

export function construirTicketPensionado(datos: DatosTicketPensionadoEscpos): Buffer {
  const partes: Buffer[] = [iniciar(), texto(datos.estacionamientoNombre, { centrado: true, negrita: true })]

  partes.push(linea())
  partes.push(texto(TITULOS_PENSIONADO[datos.tipo], { centrado: true }))
  partes.push(texto(`Folio: P-${datos.folio}`))
  partes.push(texto(`Fecha: ${new Date(datos.fecha).toLocaleString('es-MX')}`))
  partes.push(linea())
  partes.push(texto(`Nombre: ${datos.nombre}`))
  partes.push(texto(`Vehículo: ${datos.tipoVehiculo}`))
  partes.push(texto(`Placa: ${datos.placa ?? '-'}`))

  if ((datos.tipo === 'alta' || datos.tipo === 'baja') && datos.cuotaMensual != null) {
    partes.push(texto(`Cuota mensual: $${datos.cuotaMensual.toFixed(2)}`))
  }
  if (datos.tipo === 'pago') {
    const desde = new Date(datos.periodoDesde!).toLocaleDateString('es-MX')
    const hasta = new Date(datos.periodoHasta!).toLocaleDateString('es-MX')
    partes.push(texto(`Periodo: ${desde} - ${hasta}`))
    partes.push(texto(`Monto pagado: $${datos.monto!.toFixed(2)}`, { negrita: true }))
  }

  partes.push(linea())
  partes.push(saltoLinea())
  partes.push(texto('Firma: ________________________'))
  partes.push(cortar())

  return Buffer.concat(partes)
}

export interface DatosReporteCorteEscpos {
  estacionamientoNombre: string
  generadoPor: string
  soloSerieA: boolean
  desde: string
  hasta: string
  porTipoVehiculo: { tipoVehiculo: string; boletos: number; monto: number }[]
  altasPensionados: string[]
  bajasPensionados: string[]
  pagosPensionados: { pensionadoNombre: string; monto: number }[]
  gastosDelPeriodo: { concepto: string; monto: number }[]
  totalBoletos: number
  totalMonto: number
  pensionadosPagosCantidad: number
  pensionadosPagosMonto: number
  gastosEfectivoCantidad: number
  gastosEfectivoMonto: number
}

/**
 * Versión resumida (no el detalle línea por línea de cada boleto) del
 * corte de caja general para modo crudo — el detalle completo YA se manda
 * por correo en PDF/Excel al generar el corte (ver enviarPorCorreo en
 * CorteCaja.tsx), así que el papel solo necesita los totales para el
 * respaldo físico inmediato en caja.
 */
export function construirReporteCorte(datos: DatosReporteCorteEscpos): Buffer {
  const totalEnCaja = datos.totalMonto + datos.pensionadosPagosMonto - datos.gastosEfectivoMonto
  const partes: Buffer[] = [iniciar(), texto(datos.estacionamientoNombre, { centrado: true, negrita: true })]

  partes.push(texto('Corte de caja', { centrado: true }))
  partes.push(linea())
  const etiquetaPeriodo = datos.soloSerieA ? 'Periodo' : 'Periodo (pensionados y gastos)'
  partes.push(texto(`${etiquetaPeriodo}:`))
  partes.push(texto(`${new Date(datos.desde).toLocaleString()} a`))
  partes.push(texto(new Date(datos.hasta).toLocaleString()))
  partes.push(texto(`Generado por: ${datos.generadoPor}`))

  partes.push(linea())
  partes.push(texto('Por tipo de vehiculo:', { negrita: true }))
  for (const fila of datos.porTipoVehiculo) {
    partes.push(texto(`${fila.tipoVehiculo}: ${fila.boletos} - $${fila.monto.toFixed(2)}`))
  }

  if (datos.altasPensionados.length > 0 || datos.bajasPensionados.length > 0 || datos.pagosPensionados.length > 0) {
    partes.push(linea())
    partes.push(texto('Pensionados:', { negrita: true }))
    if (datos.altasPensionados.length > 0) {
      partes.push(texto(`Altas (${datos.altasPensionados.length}): ${datos.altasPensionados.join(', ')}`))
    }
    if (datos.bajasPensionados.length > 0) {
      partes.push(texto(`Bajas (${datos.bajasPensionados.length}): ${datos.bajasPensionados.join(', ')}`))
    }
    for (const p of datos.pagosPensionados) {
      partes.push(texto(`${p.pensionadoNombre}: $${p.monto.toFixed(2)}`))
    }
  }

  if (datos.gastosDelPeriodo.length > 0) {
    partes.push(linea())
    partes.push(texto('Gastos:', { negrita: true }))
    for (const g of datos.gastosDelPeriodo) {
      partes.push(texto(`${g.concepto}: $${g.monto.toFixed(2)}`))
    }
  }

  partes.push(linea())
  partes.push(texto(`Total boletos: ${datos.totalBoletos} - $${datos.totalMonto.toFixed(2)}`, { negrita: true }))
  if (datos.pensionadosPagosMonto > 0) {
    partes.push(texto(`Pensionados: ${datos.pensionadosPagosCantidad} pagos - $${datos.pensionadosPagosMonto.toFixed(2)}`))
  }
  if (datos.gastosEfectivoMonto > 0) {
    partes.push(texto(`Gastos en efectivo: ${datos.gastosEfectivoCantidad} - -$${datos.gastosEfectivoMonto.toFixed(2)}`))
  }
  partes.push(linea())
  partes.push(texto(`TOTAL EN CAJA: $${totalEnCaja.toFixed(2)}`, { centrado: true, negrita: true }))
  partes.push(saltoLinea())
  partes.push(texto('(Detalle completo por boleto enviado por correo)', { centrado: true }))
  partes.push(cortar())

  return Buffer.concat(partes)
}

export interface DatosReporteCorteSerieEscpos {
  estacionamientoNombre: string
  generadoPor: string
  serie: string
  desde: string
  hasta: string
  boletos: {
    serie: string
    folio: number
    tipoVehiculo: string
    horaEntrada: string
    horaSalida: string
    monto: number
  }[]
  totalBoletos: number
  totalMonto: number
}

const FORMATO_FECHA_CORTA: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
}

/**
 * Corte de caja de UNA serie (botón "Imprimir serie X" en CorteCaja.tsx) —
 * a diferencia del corte general, aquí SÍ va el detalle boleto por boleto
 * (es justo el propósito de este reporte: la lista física para conciliar
 * esa serie en particular), en dos líneas por boleto para cubrir bien el
 * folio, vehículo, horarios y monto sin depender de columnas exactas.
 */
export function construirReporteCorteSerie(datos: DatosReporteCorteSerieEscpos, claveFolio: string): Buffer {
  const partes: Buffer[] = [iniciar(), texto(datos.estacionamientoNombre, { centrado: true, negrita: true })]

  partes.push(texto(`Corte de caja - serie ${datos.serie}`, { centrado: true }))
  partes.push(linea())
  partes.push(texto(`Periodo: ${new Date(datos.desde).toLocaleString()} a`))
  partes.push(texto(new Date(datos.hasta).toLocaleString()))
  partes.push(texto(`Generado por: ${datos.generadoPor}`))
  partes.push(linea())

  for (const b of datos.boletos) {
    const folioTexto = formatearFolio(b.serie, b.folio, claveFolio)
    const entrada = new Date(b.horaEntrada).toLocaleString('es-MX', FORMATO_FECHA_CORTA)
    const salida = new Date(b.horaSalida).toLocaleString('es-MX', FORMATO_FECHA_CORTA)
    partes.push(texto(`${folioTexto}  ${b.tipoVehiculo}  $${b.monto.toFixed(2)}`))
    partes.push(texto(`  ${entrada} a ${salida}`))
  }

  partes.push(linea())
  partes.push(
    texto(`Total serie ${datos.serie}: ${datos.totalBoletos} boletos, $${datos.totalMonto.toFixed(2)}`, {
      negrita: true
    })
  )
  partes.push(saltoLinea())
  partes.push(cortar())

  return Buffer.concat(partes)
}

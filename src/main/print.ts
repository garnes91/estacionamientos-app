import { BrowserWindow, ipcMain } from 'electron'
import { obtenerDb } from './db'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerConfiguracionImpresion } from '../db/configuracionImpresion'
import {
  construirReporteCorte,
  construirReporteCorteMensual,
  construirReporteCorteSerie,
  construirTicketCobro,
  construirTicketEntrada,
  construirTicketPensionado
} from './escpos'
import { enviarCrudo } from './escposUsb'
import { enviarCrudoWindows } from './escposWindows'
import { ConfiguracionImpresion } from '../db/configuracionImpresion'

export type TipoImpresion = 'ticket' | 'reporte'

function construirDocumento(html: string, tipo: TipoImpresion): string {
  // 2mm de margen real de página (no 0) para tickets: muchas térmicas de
  // 80mm tienen un área imprimible real más angosta que el rollo completo
  // (el cabezal físico no llega hasta el borde) — con margin:0 el CSS deja
  // que el contenido llegue hasta el borde nominal de 80mm, pero eso puede
  // caer fuera de lo que la impresora realmente puede marcar. body ya no
  // necesita su propio padding para esto, el margen de @page basta.
  const pagina = tipo === 'ticket' ? '@page { size: 80mm auto; margin: 2mm; }' : '@page { margin: 1cm; }'
  // Impresoras térmicas baratas suelen "tragarse"/corromper las primeras
  // líneas de cada trabajo de impresión nuevo (el cabezal/buffer no
  // arranca listo justo con los primeros bytes) — se sacrifican 2 líneas
  // en blanco al inicio del ticket para que ese ruido caiga ahí y no sobre
  // el nombre/folio real.
  const relleno = tipo === 'ticket' ? '<div>&nbsp;</div><div>&nbsp;</div>' : ''
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  ${pagina}
  body { margin: 0; padding: 0; font-family: sans-serif; }
</style>
</head>
<body>${relleno}${html}</body>
</html>`
}

/** Abre una ventana oculta con solo este HTML — sin nada más de la app — y la entrega ya cargada. */
async function abrirVentanaConHtml(html: string, tipo: TipoImpresion): Promise<BrowserWindow> {
  const ventana = new BrowserWindow({ show: false })
  const documento = construirDocumento(html, tipo)
  await ventana.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(documento)}`)
  return ventana
}

/**
 * Imprime HTML ya renderizado (outerHTML de un elemento del renderer) en una
 * ventana oculta dedicada que no contiene nada más de la app. Evita
 * depender de aislar con CSS (@media print + visibility) la ventana
 * principal, que resultó frágil. `tipo` ajusta el tamaño de página: 'ticket'
 * para el ancho de rollo térmico (80mm), 'reporte' para hoja normal
 * (cortes de caja).
 *
 * Si en Configuración se fijó una impresora para este tipo (ver
 * src/db/configuracionImpresion.ts), se imprime directo ahí sin preguntar
 * (silent). Si no se ha configurado ninguna, se muestra el diálogo normal
 * de Windows para elegir — así nunca se manda a una impresora "adivinada".
 *
 * Si la instalación tiene activado el modo crudo (ver
 * src/db/configuracionImpresion.ts), un ticket o el corte de caja general
 * no pasan por nada de esto: se arman en bytes ESC/POS (ver
 * src/main/escpos.ts) — para impresoras térmicas cuyo driver gráfico no se
 * puede instalar en Windows. En Mac/Linux se manda directo por USB
 * (src/main/escposUsb.ts); en Windows, a una impresora compartida
 * localmente (src/main/escposWindows.ts), porque ahí Zadig/WinUSB no logra
 * reemplazar el driver en dispositivos clase USB "Printer". `datosTicket`/
 * `datosReporte` traen los datos estructurados que ese camino necesita; si
 * el modo crudo está apagado, o es un reporte sin `datosReporte`, se ignora
 * y se usa `html` como siempre.
 */
type DatosTicket =
  | { variante: 'entrada'; claveFolio: string; datos: Parameters<typeof construirTicketEntrada>[0] }
  | { variante: 'cobro'; claveFolio: string; datos: Parameters<typeof construirTicketCobro>[0] }
  | { variante: 'pensionado'; datos: Parameters<typeof construirTicketPensionado>[0] }

function construirBufferTicket(datosTicket: DatosTicket): Buffer {
  switch (datosTicket.variante) {
    case 'entrada':
      return construirTicketEntrada(datosTicket.datos, datosTicket.claveFolio)
    case 'cobro':
      return construirTicketCobro(datosTicket.datos, datosTicket.claveFolio)
    case 'pensionado':
      return construirTicketPensionado(datosTicket.datos)
  }
}

// El corte de caja general no lleva el detalle boleto por boleto (ese ya
// se manda por correo en PDF/Excel); el corte "por serie" sí, porque ese
// reporte es justo la lista física para conciliar una serie en particular
// (ver construirReporteCorteSerie en src/main/escpos.ts).
type DatosReporte =
  | { variante: 'general'; datos: Parameters<typeof construirReporteCorte>[0] }
  | { variante: 'serie'; claveFolio: string; datos: Parameters<typeof construirReporteCorteSerie>[0] }
  | { variante: 'mensual'; datos: Parameters<typeof construirReporteCorteMensual>[0] }

function construirBufferReporte(datosReporte: DatosReporte): Buffer {
  switch (datosReporte.variante) {
    case 'general':
      return construirReporteCorte(datosReporte.datos)
    case 'serie':
      return construirReporteCorteSerie(datosReporte.datos, datosReporte.claveFolio)
    case 'mensual':
      return construirReporteCorteMensual(datosReporte.datos)
  }
}

/** Manda un buffer ESC/POS ya armado por la ruta de modo crudo que corresponda a esta plataforma. */
async function enviarBufferModoCrudo(config: ConfiguracionImpresion, buffer: Buffer): Promise<void> {
  if (process.platform === 'win32') {
    if (!config.ticketImpresoraCompartida) {
      throw new Error(
        'Modo crudo activado pero no hay nombre de impresora compartida configurado en Admin > Impresión.'
      )
    }
    await enviarCrudoWindows(config.ticketImpresoraCompartida, buffer)
  } else {
    if (config.ticketUsbVendorId == null || config.ticketUsbProductId == null) {
      throw new Error('Modo crudo activado pero no hay impresora USB elegida en Admin > Impresión.')
    }
    await enviarCrudo(config.ticketUsbVendorId, config.ticketUsbProductId, buffer)
  }
}

export function registrarImpresion(): void {
  ipcMain.handle(
    'impresion:imprimir',
    async (
      _evento,
      params: { html: string; tipo: TipoImpresion; datosTicket?: DatosTicket; datosReporte?: DatosReporte }
    ) => {
      const estacionamiento = obtenerEstacionamientoActual(obtenerDb())
      const config = obtenerConfiguracionImpresion(obtenerDb(), estacionamiento.id)

      if (config?.ticketModoCrudo && params.tipo === 'ticket' && params.datosTicket) {
        await enviarBufferModoCrudo(config, construirBufferTicket(params.datosTicket))
        return
      }
      if (config?.ticketModoCrudo && params.tipo === 'reporte' && params.datosReporte) {
        await enviarBufferModoCrudo(config, construirBufferReporte(params.datosReporte))
        return
      }

      const ventana = await abrirVentanaConHtml(params.html, params.tipo)
      try {
        const deviceName = params.tipo === 'ticket' ? config?.impresoraTicket : config?.impresoraReporte

        await new Promise<void>((resolve, reject) => {
          const opciones: Electron.WebContentsPrintOptions = deviceName
            ? { silent: true, printBackground: true, deviceName }
            : { silent: false, printBackground: true }
          ventana.webContents.print(opciones, (success, failureReason) => {
            if (!success && failureReason !== 'cancelled') {
              reject(new Error(failureReason))
              return
            }
            resolve()
          })
        })
      } finally {
        if (!ventana.isDestroyed()) ventana.close()
      }
    }
  )
}

/** Genera el mismo reporte como PDF (para adjuntar en el correo), en vez de mandarlo a una impresora física. */
export async function generarPdf(html: string): Promise<Buffer> {
  const ventana = await abrirVentanaConHtml(html, 'reporte')
  try {
    return await ventana.webContents.printToPDF({ printBackground: true })
  } finally {
    if (!ventana.isDestroyed()) ventana.close()
  }
}

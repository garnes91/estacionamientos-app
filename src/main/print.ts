import { BrowserWindow, ipcMain } from 'electron'
import { obtenerDb } from './db'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerConfiguracionImpresion } from '../db/configuracionImpresion'

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
 */
export function registrarImpresion(): void {
  ipcMain.handle('impresion:imprimir', async (_evento, params: { html: string; tipo: TipoImpresion }) => {
    const ventana = await abrirVentanaConHtml(params.html, params.tipo)
    try {
      const estacionamiento = obtenerEstacionamientoActual(obtenerDb())
      const config = obtenerConfiguracionImpresion(obtenerDb(), estacionamiento.id)
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
  })
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

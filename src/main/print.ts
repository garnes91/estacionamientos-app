import { BrowserWindow, ipcMain } from 'electron'
import { obtenerDb } from './db'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerConfiguracionImpresion } from '../db/configuracionImpresion'

export type TipoImpresion = 'ticket' | 'reporte'

// Ancho cómodo para el contenido de 76mm de los tickets (ver BoletoImprimible.tsx
// / ReciboCobro.tsx) sin que nada se recorte por la izquierda/derecha al capturar.
const ANCHO_VENTANA_TICKET = 320

function construirDocumento(html: string, tipo: TipoImpresion): string {
  const pagina = tipo === 'ticket' ? '@page { size: 80mm auto; margin: 0; }' : '@page { margin: 1cm; }'
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  ${pagina}
  body { margin: 0; padding: 4px; font-family: sans-serif; }
</style>
</head>
<body>${html}</body>
</html>`
}

/** Abre una ventana oculta con solo este HTML — sin nada más de la app — y la entrega ya cargada. */
async function abrirVentanaConHtml(html: string, tipo: TipoImpresion): Promise<BrowserWindow> {
  const ventana = new BrowserWindow({ show: false, width: tipo === 'ticket' ? ANCHO_VENTANA_TICKET : undefined })
  const documento = construirDocumento(html, tipo)
  await ventana.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(documento)}`)
  return ventana
}

/**
 * Algunas impresoras térmicas (o su driver/filtro de impresión) imprimen
 * bien imágenes y gráficos vectoriales (el código de barras, el esquema
 * del coche) pero pierden el texto real — probado en la práctica: con CSS
 * (negritas/negro/sin antialiasing) el texto seguía sin salir. En vez de
 * seguir adivinando por qué el texto falla, se evita el problema de raíz:
 * se captura el ticket YA renderizado (texto incluido) como una sola
 * imagen, y se manda a imprimir esa imagen — nada de texto real llega a la
 * impresora, todo es una imagen, igual que ya funciona el barcode/esquema.
 * Cierra `ventanaOriginal` y devuelve una ventana nueva lista para imprimir.
 */
async function convertirEnImagenParaImprimir(ventanaOriginal: BrowserWindow): Promise<BrowserWindow> {
  const alto: number = await ventanaOriginal.webContents.executeJavaScript('document.body.scrollHeight')
  ventanaOriginal.setContentSize(ANCHO_VENTANA_TICKET, Math.max(1, Math.ceil(alto)))
  // Le da un instante al compositor de repintar ya con el tamaño nuevo antes de capturar.
  await new Promise((resolve) => setTimeout(resolve, 50))

  const captura = await ventanaOriginal.webContents.capturePage()
  ventanaOriginal.close()

  const documentoImagen = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; }
  img { display: block; width: 100%; }
</style>
</head>
<body><img src="${captura.toDataURL()}" /></body>
</html>`

  const ventanaImagen = new BrowserWindow({ show: false })
  await ventanaImagen.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(documentoImagen)}`)
  return ventanaImagen
}

/**
 * Imprime HTML ya renderizado (outerHTML de un elemento del renderer) en una
 * ventana oculta dedicada que no contiene nada más de la app. Evita
 * depender de aislar con CSS (@media print + visibility) la ventana
 * principal, que resultó frágil. `tipo` ajusta el tamaño de página: 'ticket'
 * para el ancho de rollo térmico (80mm, además convertido a imagen antes de
 * imprimir — ver convertirEnImagenParaImprimir), 'reporte' para hoja normal
 * (cortes de caja, sin cambios).
 *
 * Si en Configuración se fijó una impresora para este tipo (ver
 * src/db/configuracionImpresion.ts), se imprime directo ahí sin preguntar
 * (silent). Si no se ha configurado ninguna, se muestra el diálogo normal
 * de Windows para elegir — así nunca se manda a una impresora "adivinada".
 */
export function registrarImpresion(): void {
  ipcMain.handle('impresion:imprimir', async (_evento, params: { html: string; tipo: TipoImpresion }) => {
    let ventana = await abrirVentanaConHtml(params.html, params.tipo)
    if (params.tipo === 'ticket') {
      ventana = await convertirEnImagenParaImprimir(ventana)
    }
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

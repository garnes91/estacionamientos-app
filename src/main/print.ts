import { BrowserWindow, ipcMain } from 'electron'
import { obtenerDb } from './db'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerConfiguracionImpresion } from '../db/configuracionImpresion'

export type TipoImpresion = 'ticket' | 'reporte'

// Ancho cómodo para el contenido de 76mm de los tickets (ver BoletoImprimible.tsx
// / ReciboCobro.tsx) sin que nada se recorte por la izquierda/derecha al capturar.
const ANCHO_VENTANA_TICKET = 320

// Alto máximo (en px CSS) de cada "página" impresa de un ticket — corto a
// propósito: la impresora térmica del usuario recorta/deforma páginas altas
// (probado con "auto" y con un alto exacto grande, ambos fallaron distinto),
// pero SÍ imprime bien páginas cortas (así salió el código de barras + el
// esquema del coche originalmente). Un ticket con texto largo se divide en
// varias impresiones cortas seguidas en vez de pedirle a la impresora una
// sola página alta.
const ALTO_MAX_POR_PAGINA = 500

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

/** Imprime una única imagen ya recortada como una página corta de 80mm de ancho, alto automático. */
async function imprimirImagenComoPagina(
  imagen: Electron.NativeImage,
  deviceName: string | null | undefined
): Promise<void> {
  const documentoImagen = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; width: 80mm; }
  img { display: block; width: 80mm; height: auto; }
</style>
</head>
<body><img src="${imagen.toDataURL()}" /></body>
</html>`

  const ventana = new BrowserWindow({ show: false })
  try {
    await ventana.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(documentoImagen)}`)
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

/**
 * Algunas impresoras térmicas (o su driver/filtro de impresión) imprimen
 * bien imágenes y gráficos vectoriales (el código de barras, el esquema del
 * coche) pero pierden el texto real — probado en la práctica: con CSS
 * (negritas/negro/sin antialiasing) el texto seguía sin salir. Se evita el
 * problema de raíz: se captura el ticket YA renderizado (texto incluido)
 * como imagen — nada de texto real llega a la impresora — y, para no
 * toparse con el otro problema (páginas altas recortadas/deformadas), se
 * captura y manda a imprimir en varias tandas cortas de a lo más
 * ALTO_MAX_POR_PAGINA px CSS cada una, seguidas, en vez de una sola página
 * alta con todo el ticket.
 */
async function imprimirTicketComoImagen(html: string, deviceName: string | null | undefined): Promise<void> {
  const ventana = await abrirVentanaConHtml(html, 'ticket')

  const alto: number = await ventana.webContents.executeJavaScript('document.body.scrollHeight')
  const altoFinal = Math.max(1, Math.ceil(alto))
  ventana.setContentSize(ANCHO_VENTANA_TICKET, altoFinal)

  // window.scrollTo(0,0) + esperar fuentes/frames: tras agrandar la ventana
  // no había garantía de que el scroll quedara en el origen, y el texto
  // podía tardar un poco más que el SVG/imagen en pintarse en una ventana
  // oculta — sin esto, la captura salía recortada o incompleta.
  await ventana.webContents.executeJavaScript(`
    window.scrollTo(0, 0);
    document.fonts.ready
      .then(() => new Promise(requestAnimationFrame))
      .then(() => new Promise(requestAnimationFrame))
  `)

  const partes: Electron.NativeImage[] = []
  for (let y = 0; y < altoFinal; y += ALTO_MAX_POR_PAGINA) {
    const altoParte = Math.min(ALTO_MAX_POR_PAGINA, altoFinal - y)
    partes.push(await ventana.webContents.capturePage({ x: 0, y, width: ANCHO_VENTANA_TICKET, height: altoParte }))
  }
  ventana.close()

  // Una tanda a la vez (no en paralelo) para no mezclar los trabajos en la
  // cola de impresión — en un rollo continuo, varias impresiones cortas
  // seguidas se ven como un solo ticket largo.
  for (const parte of partes) {
    await imprimirImagenComoPagina(parte, deviceName)
  }
}

/**
 * Imprime HTML ya renderizado (outerHTML de un elemento del renderer). `tipo`
 * decide el camino: 'ticket' se captura e imprime como imagen (ver
 * imprimirTicketComoImagen), 'reporte' sigue el camino normal (documento
 * HTML con texto real, en una ventana oculta dedicada — evita depender de
 * aislar con CSS @media print + visibility la ventana principal, que
 * resultó frágil).
 *
 * Si en Configuración se fijó una impresora para este tipo (ver
 * src/db/configuracionImpresion.ts), se imprime directo ahí sin preguntar
 * (silent). Si no se ha configurado ninguna, se muestra el diálogo normal
 * de Windows para elegir — así nunca se manda a una impresora "adivinada".
 */
export function registrarImpresion(): void {
  ipcMain.handle('impresion:imprimir', async (_evento, params: { html: string; tipo: TipoImpresion }) => {
    const estacionamiento = obtenerEstacionamientoActual(obtenerDb())
    const config = obtenerConfiguracionImpresion(obtenerDb(), estacionamiento.id)
    const deviceName = params.tipo === 'ticket' ? config?.impresoraTicket : config?.impresoraReporte

    if (params.tipo === 'ticket') {
      await imprimirTicketComoImagen(params.html, deviceName)
      return
    }

    const ventana = await abrirVentanaConHtml(params.html, params.tipo)
    try {
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

import { ipcMain } from 'electron'
import nodemailer from 'nodemailer'
import { obtenerDb } from './db'
import { requerirAdmin, requerirUsuarioActual } from './auth'
import { generarPdf } from './print'
import { generarExcelCorte } from './excelCorte'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerConfiguracionCorreo, ConfiguracionCorreo } from '../db/configuracionCorreo'
import { obtenerDetalleCorte } from '../db/cortes'

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString()
}

/** Quita caracteres inválidos en nombres de archivo (Windows es el más estricto) y espacios por "_". */
function sanitizarNombreArchivo(texto: string): string {
  return texto
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
}

/** Fecha local (no UTC) en YYYY-MM-DD, para que el archivo diga el día real del corte, no el de otro huso horario. */
function formatearFechaArchivo(iso: string): string {
  const fecha = new Date(iso)
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

/**
 * Envía el corte de caja por correo: PDF idéntico al reporte que se imprime
 * (mismo HTML, vía generarPdf) + un Excel con el detalle de cada boleto.
 * Requiere que ya se haya guardado la configuración SMTP en Configuración >
 * Correo — si no, avisa claro en vez de fallar con un error críptico.
 */
export function registrarCorreo(): void {
  ipcMain.handle('correo:enviarCorte', async (_evento, params: { corteId: number; htmlReporte: string }) => {
    requerirUsuarioActual()
    const db = obtenerDb()
    const estacionamiento = obtenerEstacionamientoActual(db)

    const config = obtenerConfiguracionCorreo(db, estacionamiento.id)
    if (!config) {
      throw new Error('No hay configuración de correo. Configúrala en Configuración > Correo antes de enviar.')
    }

    const detalle = obtenerDetalleCorte(db, params.corteId)

    const [pdf, excel] = await Promise.all([
      generarPdf(params.htmlReporte),
      generarExcelCorte(detalle, estacionamiento.nombre)
    ])

    const transportador = nodemailer.createTransport({
      host: config.host,
      port: config.puerto,
      secure: config.seguro,
      auth: { user: config.usuario, pass: config.password }
    })

    const nombreArchivo = `corte_${sanitizarNombreArchivo(estacionamiento.nombre)}_${formatearFechaArchivo(detalle.hasta)}`
    await transportador.sendMail({
      from: config.remitente,
      to: config.destinatarios,
      subject: `Corte de caja — ${estacionamiento.nombre} (${formatearFecha(detalle.hasta)})`,
      text: `Corte de caja del ${formatearFecha(detalle.desde)} al ${formatearFecha(detalle.hasta)}.\nBoletos: ${detalle.totalBoletos}, $${detalle.totalMonto.toFixed(2)}.\nPensionados: ${detalle.pensionadosPagosCantidad} pagos, $${detalle.pensionadosPagosMonto.toFixed(2)}.\nGastos en efectivo: ${detalle.gastosEfectivoCantidad}, -$${detalle.gastosEfectivoMonto.toFixed(2)}.\nTotal en caja: $${(detalle.totalMonto + detalle.pensionadosPagosMonto - detalle.gastosEfectivoMonto).toFixed(2)}.\n\nSe adjunta en PDF y Excel.`,
      attachments: [
        { filename: `${nombreArchivo}.pdf`, content: pdf },
        {
          filename: `${nombreArchivo}.xlsx`,
          content: excel,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ]
    })
  })

  // Verifica credenciales/host SMTP sin mandar un correo real — para probar
  // antes de guardar y no descubrir un typo hasta el primer corte real.
  ipcMain.handle('correo:probarConexion', async (_evento, config: ConfiguracionCorreo) => {
    requerirAdmin()
    const transportador = nodemailer.createTransport({
      host: config.host,
      port: config.puerto,
      secure: config.seguro,
      auth: { user: config.usuario, pass: config.password }
    })
    await transportador.verify()
  })
}

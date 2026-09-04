import type { DB } from './index'

export interface ConfiguracionImpresion {
  impresoraTicket: string | null
  impresoraReporte: string | null
  // Modo crudo (ESC/POS directo por USB, ver src/main/escpos.ts) — para
  // impresoras térmicas cuyo driver gráfico no se puede instalar. Cuando
  // está activo, ticketUsbVendorId/ticketUsbProductId identifican el
  // dispositivo USB en vez de impresoraTicket (que es una cola de
  // impresión de Windows, no aplica en este modo).
  ticketModoCrudo: boolean
  ticketUsbVendorId: number | null
  ticketUsbProductId: number | null
}

interface ConfiguracionImpresionRow {
  impresora_ticket: string | null
  impresora_reporte: string | null
  ticket_modo_crudo: number
  ticket_usb_vendor_id: number | null
  ticket_usb_product_id: number | null
}

export function obtenerConfiguracionImpresion(db: DB, estacionamientoId: number): ConfiguracionImpresion | null {
  const fila = db
    .prepare<[number], ConfiguracionImpresionRow>(
      `SELECT impresora_ticket, impresora_reporte, ticket_modo_crudo, ticket_usb_vendor_id, ticket_usb_product_id
       FROM configuracion_impresion WHERE estacionamiento_id = ?`
    )
    .get(estacionamientoId)

  if (!fila) return null
  return {
    impresoraTicket: fila.impresora_ticket,
    impresoraReporte: fila.impresora_reporte,
    ticketModoCrudo: fila.ticket_modo_crudo === 1,
    ticketUsbVendorId: fila.ticket_usb_vendor_id,
    ticketUsbProductId: fila.ticket_usb_product_id
  }
}

export function guardarConfiguracionImpresion(
  db: DB,
  estacionamientoId: number,
  config: ConfiguracionImpresion
): void {
  db.prepare(
    `INSERT INTO configuracion_impresion
       (estacionamiento_id, impresora_ticket, impresora_reporte, ticket_modo_crudo, ticket_usb_vendor_id, ticket_usb_product_id)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(estacionamiento_id) DO UPDATE SET
       impresora_ticket = excluded.impresora_ticket,
       impresora_reporte = excluded.impresora_reporte,
       ticket_modo_crudo = excluded.ticket_modo_crudo,
       ticket_usb_vendor_id = excluded.ticket_usb_vendor_id,
       ticket_usb_product_id = excluded.ticket_usb_product_id`
  ).run(
    estacionamientoId,
    config.impresoraTicket,
    config.impresoraReporte,
    config.ticketModoCrudo ? 1 : 0,
    config.ticketUsbVendorId,
    config.ticketUsbProductId
  )
}

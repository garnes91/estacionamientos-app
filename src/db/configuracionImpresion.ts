import type { DB } from './index'

export interface ConfiguracionImpresion {
  impresoraTicket: string | null
  impresoraReporte: string | null
  // Modo crudo (ESC/POS directo, ver src/main/escpos.ts) — para impresoras
  // térmicas cuyo driver gráfico no se puede instalar. En Mac/Linux se
  // habla directo al dispositivo USB (ticketUsbVendorId/ticketUsbProductId,
  // ver src/main/escposUsb.ts). En Windows, Zadig/WinUSB no logra
  // reemplazar el driver en impresoras clase USB "Printer" — en su lugar
  // se manda el buffer a una impresora compartida localmente instalada
  // con el driver "Generic / Text Only" (ticketImpresoraCompartida, ver
  // src/main/escposWindows.ts). Ninguno de los tres aplica a
  // impresoraTicket (cola de impresión de Windows) en este modo.
  ticketModoCrudo: boolean
  ticketUsbVendorId: number | null
  ticketUsbProductId: number | null
  ticketImpresoraCompartida: string | null
}

interface ConfiguracionImpresionRow {
  impresora_ticket: string | null
  impresora_reporte: string | null
  ticket_modo_crudo: number
  ticket_usb_vendor_id: number | null
  ticket_usb_product_id: number | null
  ticket_impresora_compartida: string | null
}

export function obtenerConfiguracionImpresion(db: DB, estacionamientoId: number): ConfiguracionImpresion | null {
  const fila = db
    .prepare<[number], ConfiguracionImpresionRow>(
      `SELECT impresora_ticket, impresora_reporte, ticket_modo_crudo, ticket_usb_vendor_id, ticket_usb_product_id,
              ticket_impresora_compartida
       FROM configuracion_impresion WHERE estacionamiento_id = ?`
    )
    .get(estacionamientoId)

  if (!fila) return null
  return {
    impresoraTicket: fila.impresora_ticket,
    impresoraReporte: fila.impresora_reporte,
    ticketModoCrudo: fila.ticket_modo_crudo === 1,
    ticketUsbVendorId: fila.ticket_usb_vendor_id,
    ticketUsbProductId: fila.ticket_usb_product_id,
    ticketImpresoraCompartida: fila.ticket_impresora_compartida
  }
}

export function guardarConfiguracionImpresion(
  db: DB,
  estacionamientoId: number,
  config: ConfiguracionImpresion
): void {
  db.prepare(
    `INSERT INTO configuracion_impresion
       (estacionamiento_id, impresora_ticket, impresora_reporte, ticket_modo_crudo, ticket_usb_vendor_id,
        ticket_usb_product_id, ticket_impresora_compartida)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(estacionamiento_id) DO UPDATE SET
       impresora_ticket = excluded.impresora_ticket,
       impresora_reporte = excluded.impresora_reporte,
       ticket_modo_crudo = excluded.ticket_modo_crudo,
       ticket_usb_vendor_id = excluded.ticket_usb_vendor_id,
       ticket_usb_product_id = excluded.ticket_usb_product_id,
       ticket_impresora_compartida = excluded.ticket_impresora_compartida`
  ).run(
    estacionamientoId,
    config.impresoraTicket,
    config.impresoraReporte,
    config.ticketModoCrudo ? 1 : 0,
    config.ticketUsbVendorId,
    config.ticketUsbProductId,
    config.ticketImpresoraCompartida
  )
}

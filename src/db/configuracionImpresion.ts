import type { DB } from './index'

export interface ConfiguracionImpresion {
  impresoraTicket: string | null
  impresoraReporte: string | null
}

interface ConfiguracionImpresionRow {
  impresora_ticket: string | null
  impresora_reporte: string | null
}

export function obtenerConfiguracionImpresion(db: DB, estacionamientoId: number): ConfiguracionImpresion | null {
  const fila = db
    .prepare<[number], ConfiguracionImpresionRow>(
      'SELECT impresora_ticket, impresora_reporte FROM configuracion_impresion WHERE estacionamiento_id = ?'
    )
    .get(estacionamientoId)

  if (!fila) return null
  return { impresoraTicket: fila.impresora_ticket, impresoraReporte: fila.impresora_reporte }
}

export function guardarConfiguracionImpresion(
  db: DB,
  estacionamientoId: number,
  config: ConfiguracionImpresion
): void {
  db.prepare(
    `INSERT INTO configuracion_impresion (estacionamiento_id, impresora_ticket, impresora_reporte)
     VALUES (?,?,?)
     ON CONFLICT(estacionamiento_id) DO UPDATE SET
       impresora_ticket = excluded.impresora_ticket,
       impresora_reporte = excluded.impresora_reporte`
  ).run(estacionamientoId, config.impresoraTicket, config.impresoraReporte)
}

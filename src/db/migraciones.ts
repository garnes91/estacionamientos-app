import type { DB } from './index'

/**
 * `CREATE TABLE IF NOT EXISTS` en schema.sql no agrega columnas a una tabla
 * que ya existe — solo sirve para bases nuevas. Cualquier columna agregada
 * a una tabla existente después del primer release necesita pasar por aquí
 * también (con `agregarColumnaSiFalta`), o las instalaciones ya en campo se
 * rompen al actualizar.
 *
 * Debe correr ANTES de aplicar schema.sql, por si schema.sql crea índices
 * que referencien columnas nuevas.
 *
 */
export function migrarColumnasFaltantes(db: DB): void {
  agregarColumnaSiFalta(db, 'cortes', 'pensionados_pagos_cantidad', 'pensionados_pagos_cantidad INTEGER NOT NULL DEFAULT 0')
  agregarColumnaSiFalta(db, 'cortes', 'pensionados_pagos_monto', 'pensionados_pagos_monto REAL NOT NULL DEFAULT 0')
  agregarColumnaSiFalta(db, 'cortes', 'gastos_efectivo_cantidad', 'gastos_efectivo_cantidad INTEGER NOT NULL DEFAULT 0')
  agregarColumnaSiFalta(db, 'cortes', 'gastos_efectivo_monto', 'gastos_efectivo_monto REAL NOT NULL DEFAULT 0')
  agregarColumnaSiFalta(db, 'estacionamientos', 'cargo_boleto_perdido', 'cargo_boleto_perdido REAL NOT NULL DEFAULT 0')
  agregarColumnaSiFalta(db, 'boletos', 'boleto_perdido', "boleto_perdido INTEGER NOT NULL DEFAULT 0 CHECK (boleto_perdido IN (0, 1))")
  agregarColumnaSiFalta(db, 'boletos', 'recargo_boleto_perdido', 'recargo_boleto_perdido REAL')
  agregarColumnaSiFalta(
    db,
    'configuracion_impresion',
    'ticket_modo_crudo',
    'ticket_modo_crudo INTEGER NOT NULL DEFAULT 0 CHECK (ticket_modo_crudo IN (0, 1))'
  )
  agregarColumnaSiFalta(db, 'configuracion_impresion', 'ticket_usb_vendor_id', 'ticket_usb_vendor_id INTEGER')
  agregarColumnaSiFalta(db, 'configuracion_impresion', 'ticket_usb_product_id', 'ticket_usb_product_id INTEGER')
  agregarColumnaSiFalta(
    db,
    'configuracion_impresion',
    'ticket_impresora_compartida',
    'ticket_impresora_compartida TEXT'
  )
}

function tablaExiste(db: DB, tabla: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabla) != null
}

export function agregarColumnaSiFalta(db: DB, tabla: string, columna: string, definicionColumna: string): void {
  // Tabla nueva: schema.sql la crea completa (con esta columna incluida) más adelante, nada que migrar aquí.
  if (!tablaExiste(db, tabla)) return

  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]
  if (!columnas.some((c) => c.name === columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${definicionColumna}`)
  }
}

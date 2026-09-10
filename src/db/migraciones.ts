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
  agregarColumnaSiFalta(
    db,
    'estacionamientos',
    'umbral_recobro_sospechoso',
    'umbral_recobro_sospechoso INTEGER NOT NULL DEFAULT 2'
  )
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
  agregarColumnaSiFalta(
    db,
    'configuracion_monitoreo',
    'respaldo_nube',
    'respaldo_nube INTEGER NOT NULL DEFAULT 0 CHECK (respaldo_nube IN (0, 1))'
  )
  agregarColumnaSiFalta(
    db,
    'configuracion_facturacion',
    'descripcion_servicio',
    "descripcion_servicio TEXT NOT NULL DEFAULT 'Servicio de estacionamiento'"
  )
  ampliarRolUsuariosSiHaceFalta(db)
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

/**
 * Agrega el rol 'supervisor' al CHECK de usuarios.rol. A diferencia de una
 * columna nueva, SQLite no deja modificar un CHECK existente con ALTER
 * TABLE — hay que recrear la tabla completa (procedimiento oficial de
 * sqlite.org para "other kinds of table schema changes"): crear la tabla
 * nueva con OTRO nombre, copiar los datos, borrar la vieja, y hasta el
 * final renombrar la nueva al nombre original. Ese orden importa: si en
 * vez de eso se renombrara primero la tabla vieja (usuarios → usuarios_old),
 * SQLite reescribe automáticamente las cláusulas REFERENCES usuarios(id)
 * de boletos/cortes/gastos/pensionados para que apunten a usuarios_old,
 * dejando el esquema roto. Con este orden nunca se renombra la tabla que
 * otras tablas referencian, así que ninguna de ellas se toca.
 */
export function ampliarRolUsuariosSiHaceFalta(db: DB): void {
  if (!tablaExiste(db, 'usuarios')) return // tabla nueva: schema.sql ya la crea con el CHECK correcto

  const fila = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'")
    .get() as { sql: string } | undefined
  if (!fila || fila.sql.includes('supervisor')) return // ya migrada

  db.pragma('foreign_keys = OFF')
  try {
    const migrar = db.transaction(() => {
      db.exec(`
        CREATE TABLE usuarios_nueva (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
          nombre_usuario      TEXT NOT NULL,
          password_hash       TEXT NOT NULL,
          nombre_completo     TEXT NOT NULL,
          rol                 TEXT NOT NULL CHECK (rol IN ('admin', 'supervisor', 'empleado')),
          activo              INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
          created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE (estacionamiento_id, nombre_usuario)
        )
      `)
      db.exec('INSERT INTO usuarios_nueva SELECT * FROM usuarios')
      db.exec('DROP TABLE usuarios')
      db.exec('ALTER TABLE usuarios_nueva RENAME TO usuarios')
    })
    migrar()

    const violaciones = db.pragma('foreign_key_check') as unknown[]
    if (violaciones.length > 0) {
      throw new Error('La migración del rol supervisor dejó referencias rotas en foreign keys — no se aplicó.')
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

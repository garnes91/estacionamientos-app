import type { DB } from './index'

// Solo el interruptor — todo lo demás (código postal fiscal, catálogo
// SAT, descripción del servicio, organizationId, secretKey) vive SOLO en
// Firestore (facturacionSecretos/{slug}, capturado a mano). Nada de eso
// lo usa esta app localmente, así que no tiene caso duplicarlo aquí. Ver
// el comentario en schema.sql para el detalle completo.
export interface ConfiguracionFacturacion {
  habilitado: boolean
}

interface ConfiguracionFacturacionRow {
  habilitado: number
}

export function obtenerConfiguracionFacturacion(db: DB, estacionamientoId: number): ConfiguracionFacturacion | null {
  const fila = db
    .prepare<[number], ConfiguracionFacturacionRow>(
      'SELECT habilitado FROM configuracion_facturacion WHERE estacionamiento_id = ?'
    )
    .get(estacionamientoId)

  if (!fila) return null
  return { habilitado: fila.habilitado === 1 }
}

export function guardarConfiguracionFacturacion(
  db: DB,
  estacionamientoId: number,
  config: ConfiguracionFacturacion
): void {
  db.prepare(
    `INSERT INTO configuracion_facturacion (estacionamiento_id, habilitado)
     VALUES (?,?)
     ON CONFLICT(estacionamiento_id) DO UPDATE SET habilitado = excluded.habilitado`
  ).run(estacionamientoId, config.habilitado ? 1 : 0)
}

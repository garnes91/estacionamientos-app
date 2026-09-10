import type { DB } from './index'

// OJO: aquí NO se guarda el RFC/razón social/régimen fiscal del
// estacionamiento — se quitaron porque no se usan en ningún lado del
// flujo real de facturación (FacturAPI ya conoce al emisor por la
// organización/llave a la que está ligado el secretKey, no por datos que
// la app le mande en cada factura). Ver el comentario en schema.sql.
export interface ConfiguracionFacturacion {
  habilitado: boolean
  codigoPostalFiscal: string
  claveProductoServicio: string
  claveUnidad: string
  descripcionServicio: string
}

interface ConfiguracionFacturacionRow {
  habilitado: number
  codigo_postal_fiscal: string
  clave_producto_servicio: string
  clave_unidad: string
  descripcion_servicio: string
}

export function obtenerConfiguracionFacturacion(db: DB, estacionamientoId: number): ConfiguracionFacturacion | null {
  const fila = db
    .prepare<[number], ConfiguracionFacturacionRow>(
      `SELECT habilitado, codigo_postal_fiscal, clave_producto_servicio, clave_unidad, descripcion_servicio
       FROM configuracion_facturacion WHERE estacionamiento_id = ?`
    )
    .get(estacionamientoId)

  if (!fila) return null
  return {
    habilitado: fila.habilitado === 1,
    codigoPostalFiscal: fila.codigo_postal_fiscal,
    claveProductoServicio: fila.clave_producto_servicio,
    claveUnidad: fila.clave_unidad,
    descripcionServicio: fila.descripcion_servicio
  }
}

const CODIGO_POSTAL_VALIDO = /^\d{5}$/

export function guardarConfiguracionFacturacion(
  db: DB,
  estacionamientoId: number,
  config: ConfiguracionFacturacion
): void {
  if (!CODIGO_POSTAL_VALIDO.test(config.codigoPostalFiscal.trim())) {
    throw new Error('El código postal fiscal debe tener 5 dígitos')
  }

  db.prepare(
    `INSERT INTO configuracion_facturacion
       (estacionamiento_id, habilitado, codigo_postal_fiscal, clave_producto_servicio, clave_unidad, descripcion_servicio)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(estacionamiento_id) DO UPDATE SET
       habilitado = excluded.habilitado,
       codigo_postal_fiscal = excluded.codigo_postal_fiscal,
       clave_producto_servicio = excluded.clave_producto_servicio,
       clave_unidad = excluded.clave_unidad,
       descripcion_servicio = excluded.descripcion_servicio`
  ).run(
    estacionamientoId,
    config.habilitado ? 1 : 0,
    config.codigoPostalFiscal.trim(),
    config.claveProductoServicio.trim(),
    config.claveUnidad.trim(),
    config.descripcionServicio.trim()
  )
}

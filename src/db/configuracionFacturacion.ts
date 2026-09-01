import type { DB } from './index'

export interface ConfiguracionFacturacion {
  habilitado: boolean
  rfc: string
  razonSocial: string
  regimenFiscal: string
  codigoPostalFiscal: string
  claveProductoServicio: string
  claveUnidad: string
}

interface ConfiguracionFacturacionRow {
  habilitado: number
  rfc: string
  razon_social: string
  regimen_fiscal: string
  codigo_postal_fiscal: string
  clave_producto_servicio: string
  clave_unidad: string
}

export function obtenerConfiguracionFacturacion(db: DB, estacionamientoId: number): ConfiguracionFacturacion | null {
  const fila = db
    .prepare<[number], ConfiguracionFacturacionRow>(
      `SELECT habilitado, rfc, razon_social, regimen_fiscal, codigo_postal_fiscal, clave_producto_servicio, clave_unidad
       FROM configuracion_facturacion WHERE estacionamiento_id = ?`
    )
    .get(estacionamientoId)

  if (!fila) return null
  return {
    habilitado: fila.habilitado === 1,
    rfc: fila.rfc,
    razonSocial: fila.razon_social,
    regimenFiscal: fila.regimen_fiscal,
    codigoPostalFiscal: fila.codigo_postal_fiscal,
    claveProductoServicio: fila.clave_producto_servicio,
    claveUnidad: fila.clave_unidad
  }
}

// Persona física (4 letras + 6 dígitos + 3 alfanuméricos) o moral (3 letras
// + 6 dígitos + 3 alfanuméricos). No valida homoclave ni existencia real.
const RFC_VALIDO = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/
const REGIMEN_FISCAL_VALIDO = /^\d{3}$/
const CODIGO_POSTAL_VALIDO = /^\d{5}$/

export function guardarConfiguracionFacturacion(
  db: DB,
  estacionamientoId: number,
  config: ConfiguracionFacturacion
): void {
  const rfc = config.rfc.trim().toUpperCase()
  if (!RFC_VALIDO.test(rfc)) {
    throw new Error('El RFC no tiene un formato válido (12 caracteres para persona moral, 13 para persona física)')
  }
  if (!REGIMEN_FISCAL_VALIDO.test(config.regimenFiscal.trim())) {
    throw new Error('El régimen fiscal debe ser la clave numérica de 3 dígitos del catálogo del SAT (ej. "626" para RESICO)')
  }
  if (!CODIGO_POSTAL_VALIDO.test(config.codigoPostalFiscal.trim())) {
    throw new Error('El código postal fiscal debe tener 5 dígitos')
  }
  if (!config.razonSocial.trim()) {
    throw new Error('La razón social no puede estar vacía')
  }

  db.prepare(
    `INSERT INTO configuracion_facturacion
       (estacionamiento_id, habilitado, rfc, razon_social, regimen_fiscal, codigo_postal_fiscal, clave_producto_servicio, clave_unidad)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(estacionamiento_id) DO UPDATE SET
       habilitado = excluded.habilitado,
       rfc = excluded.rfc,
       razon_social = excluded.razon_social,
       regimen_fiscal = excluded.regimen_fiscal,
       codigo_postal_fiscal = excluded.codigo_postal_fiscal,
       clave_producto_servicio = excluded.clave_producto_servicio,
       clave_unidad = excluded.clave_unidad`
  ).run(
    estacionamientoId,
    config.habilitado ? 1 : 0,
    rfc,
    config.razonSocial.trim(),
    config.regimenFiscal.trim(),
    config.codigoPostalFiscal.trim(),
    config.claveProductoServicio.trim(),
    config.claveUnidad.trim()
  )
}

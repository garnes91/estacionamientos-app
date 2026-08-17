import type { DB } from './index'

export interface ConfiguracionMonitoreo {
  habilitado: boolean
  apiKey: string
  projectId: string
  slug: string
}

interface ConfiguracionMonitoreoRow {
  habilitado: number
  api_key: string
  project_id: string
  slug: string
}

export function obtenerConfiguracionMonitoreo(db: DB, estacionamientoId: number): ConfiguracionMonitoreo | null {
  const fila = db
    .prepare<[number], ConfiguracionMonitoreoRow>(
      'SELECT habilitado, api_key, project_id, slug FROM configuracion_monitoreo WHERE estacionamiento_id = ?'
    )
    .get(estacionamientoId)

  if (!fila) return null
  return { habilitado: fila.habilitado === 1, apiKey: fila.api_key, projectId: fila.project_id, slug: fila.slug }
}

const SLUG_VALIDO = /^[a-z0-9-]{1,64}$/

export function guardarConfiguracionMonitoreo(
  db: DB,
  estacionamientoId: number,
  config: ConfiguracionMonitoreo
): void {
  const slug = config.slug.trim().toLowerCase()
  if (!SLUG_VALIDO.test(slug)) {
    throw new Error('El identificador debe ser minúsculas, números y guiones, sin espacios (ej. "centro")')
  }

  db.prepare(
    `INSERT INTO configuracion_monitoreo (estacionamiento_id, habilitado, api_key, project_id, slug)
     VALUES (?,?,?,?,?)
     ON CONFLICT(estacionamiento_id) DO UPDATE SET
       habilitado = excluded.habilitado,
       api_key = excluded.api_key,
       project_id = excluded.project_id,
       slug = excluded.slug`
  ).run(estacionamientoId, config.habilitado ? 1 : 0, config.apiKey, config.projectId, slug)
}

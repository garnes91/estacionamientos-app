import type { DB } from './index'

export interface ConfiguracionMonitoreo {
  habilitado: boolean
  apiKey: string
  projectId: string
  slug: string
  // Independiente de `habilitado` (que es el latido en vivo): sube el
  // respaldo automático diario a Firebase Storage, reutilizando estas
  // mismas credenciales. Ver src/main/respaldoNube.ts.
  respaldoNube: boolean
}

interface ConfiguracionMonitoreoRow {
  habilitado: number
  api_key: string
  project_id: string
  slug: string
  respaldo_nube: number
}

export function obtenerConfiguracionMonitoreo(db: DB, estacionamientoId: number): ConfiguracionMonitoreo | null {
  const fila = db
    .prepare<[number], ConfiguracionMonitoreoRow>(
      'SELECT habilitado, api_key, project_id, slug, respaldo_nube FROM configuracion_monitoreo WHERE estacionamiento_id = ?'
    )
    .get(estacionamientoId)

  if (!fila) return null
  return {
    habilitado: fila.habilitado === 1,
    apiKey: fila.api_key,
    projectId: fila.project_id,
    slug: fila.slug,
    respaldoNube: fila.respaldo_nube === 1
  }
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
    `INSERT INTO configuracion_monitoreo (estacionamiento_id, habilitado, api_key, project_id, slug, respaldo_nube)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(estacionamiento_id) DO UPDATE SET
       habilitado = excluded.habilitado,
       api_key = excluded.api_key,
       project_id = excluded.project_id,
       slug = excluded.slug,
       respaldo_nube = excluded.respaldo_nube`
  ).run(
    estacionamientoId,
    config.habilitado ? 1 : 0,
    config.apiKey,
    config.projectId,
    slug,
    config.respaldoNube ? 1 : 0
  )
}

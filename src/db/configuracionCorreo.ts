import type { DB } from './index'

export interface ConfiguracionCorreo {
  host: string
  puerto: number
  seguro: boolean
  usuario: string
  password: string
  remitente: string
  destinatarios: string
}

interface ConfiguracionCorreoRow {
  host: string
  puerto: number
  seguro: number
  usuario: string
  password: string
  remitente: string
  destinatarios: string
}

export function obtenerConfiguracionCorreo(db: DB, estacionamientoId: number): ConfiguracionCorreo | null {
  const fila = db
    .prepare<[number], ConfiguracionCorreoRow>(
      'SELECT host, puerto, seguro, usuario, password, remitente, destinatarios FROM configuracion_correo WHERE estacionamiento_id = ?'
    )
    .get(estacionamientoId)

  if (!fila) return null
  return { ...fila, seguro: fila.seguro === 1 }
}

export function guardarConfiguracionCorreo(db: DB, estacionamientoId: number, config: ConfiguracionCorreo): void {
  db.prepare(
    `INSERT INTO configuracion_correo (estacionamiento_id, host, puerto, seguro, usuario, password, remitente, destinatarios)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(estacionamiento_id) DO UPDATE SET
       host = excluded.host,
       puerto = excluded.puerto,
       seguro = excluded.seguro,
       usuario = excluded.usuario,
       password = excluded.password,
       remitente = excluded.remitente,
       destinatarios = excluded.destinatarios`
  ).run(
    estacionamientoId,
    config.host,
    config.puerto,
    config.seguro ? 1 : 0,
    config.usuario,
    config.password,
    config.remitente,
    config.destinatarios
  )
}

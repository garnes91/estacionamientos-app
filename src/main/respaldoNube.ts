import { readFileSync, existsSync } from 'fs'
import { ConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { nombreRespaldoDelDia, respaldosAEliminar, rutaRespaldoDelDia } from './respaldos'
import { bucketPorDefecto, eliminarArchivo, listarArchivos, subirArchivo } from './firebaseStorageRest'

/**
 * Respaldo en la nube — sube a Firebase Storage el MISMO archivo que ya
 * generó el respaldo automático local del día (respaldarSiHaceFalta, ver
 * respaldos.ts), en vez de volver a respaldar la base por separado. Usa las
 * credenciales de "Monitoreo en la nube" (mismo proyecto de Firebase, auth
 * anónima) pero es un interruptor independiente (config.respaldoNube) — un
 * estacionamiento puede querer uno sin el otro.
 *
 * Retención: igual que el local, se conservan los últimos 14 (ver
 * CANTIDAD_RESPALDOS_A_CONSERVAR en respaldos.ts / respaldosAEliminar).
 */

function carpetaEnStorage(slug: string): string {
  return `respaldos/${slug}/`
}

/** Silencioso si el respaldo en la nube no está activado o si el respaldo local del día todavía no existe. */
export async function subirRespaldoNubeSiHaceFalta(
  carpetaUserData: string,
  config: ConfiguracionMonitoreo,
  fecha = new Date()
): Promise<void> {
  if (!config.respaldoNube) return

  const rutaLocal = rutaRespaldoDelDia(carpetaUserData, fecha)
  if (!existsSync(rutaLocal)) return

  const bucket = bucketPorDefecto(config.projectId)
  const prefijo = carpetaEnStorage(config.slug)
  const existentes = await listarArchivos(config, bucket, prefijo)
  const nombresExistentes = existentes.map((a) => a.nombre.slice(prefijo.length))

  const nombreHoy = nombreRespaldoDelDia(fecha)
  if (!nombresExistentes.includes(nombreHoy)) {
    await subirArchivo(config, bucket, prefijo + nombreHoy, readFileSync(rutaLocal))
    nombresExistentes.push(nombreHoy)
  }

  for (const archivo of respaldosAEliminar(nombresExistentes)) {
    await eliminarArchivo(config, bucket, prefijo + archivo)
  }
}

export interface RespaldoNubeInfo {
  archivo: string
  fecha: string
  tamanoBytes: number
}

/** Para mostrar en Admin > Respaldo qué respaldos hay ahora mismo en la nube. */
export async function listarRespaldosNube(config: ConfiguracionMonitoreo): Promise<RespaldoNubeInfo[]> {
  const bucket = bucketPorDefecto(config.projectId)
  const prefijo = carpetaEnStorage(config.slug)
  const archivos = await listarArchivos(config, bucket, prefijo)
  return archivos
    .map((a) => ({ archivo: a.nombre.slice(prefijo.length), fecha: a.actualizadoEn, tamanoBytes: a.tamanoBytes }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { abrirDb, DB } from '../db'

/**
 * Respaldos de la base de datos SQLite de esta instalación (una por
 * estacionamiento, ver src/main/db.ts). Dos mecanismos, complementarios:
 *
 * - Automático (respaldarSiHaceFalta): silencioso, uno por día, en una
 *   carpeta dentro de los datos de la app. Protege contra corrupción,
 *   borrado accidental o un bug de la app — pero NO contra que falle el
 *   disco completo, porque vive en el mismo disco que la base real.
 * - Manual (exportarRespaldo): el admin elige dónde guardarlo (USB,
 *   Google Drive, etc. — ver el diálogo en ipcAdmin.ts). Ese sí protege
 *   contra una falla de disco, siempre que se guarde en otro dispositivo.
 *
 * Ambos usan Database.backup() de better-sqlite3 — una copia "en línea"
 * del propio motor de SQLite, segura aunque la app siga usando la base al
 * mismo tiempo (a diferencia de copiar el archivo .db a mano, que puede
 * quedar a medias si hay escrituras en curso o el modo WAL de por medio).
 */

const CANTIDAD_RESPALDOS_A_CONSERVAR = 14
const PREFIJO_ARCHIVO = 'estacionamientos-'
const SUFIJO_ARCHIVO = '.db'

export function nombreRespaldoDelDia(fecha: Date): string {
  return `${PREFIJO_ARCHIVO}${fecha.toISOString().slice(0, 10)}${SUFIJO_ARCHIVO}`
}

/**
 * De una lista de nombres de archivo ya en la carpeta de respaldos, cuáles
 * hay que borrar para no acumular de más — conserva los `conservar` más
 * recientes (los nombres traen la fecha en formato ISO, así que ordenar
 * alfabéticamente ya los ordena cronológicamente). Función pura (no toca
 * el disco) para poder probarla sin Electron.
 */
export function respaldosAEliminar(nombresArchivo: string[], conservar = CANTIDAD_RESPALDOS_A_CONSERVAR): string[] {
  const propios = nombresArchivo.filter((f) => f.startsWith(PREFIJO_ARCHIVO) && f.endsWith(SUFIJO_ARCHIVO)).sort()
  return propios.slice(0, Math.max(0, propios.length - conservar))
}

function carpetaRespaldos(carpetaUserData: string): string {
  const ruta = join(carpetaUserData, 'respaldos')
  if (!existsSync(ruta)) mkdirSync(ruta, { recursive: true })
  return ruta
}

/**
 * Respaldo automático diario — si ya existe el de hoy, no hace nada (se
 * puede llamar en cada arranque de la app sin duplicar trabajo). Se llama
 * fire-and-forget desde index.ts; un error aquí (ej. disco lleno) no debe
 * tumbar el arranque de la app.
 */
export async function respaldarSiHaceFalta(db: DB, carpetaUserData: string, fecha = new Date()): Promise<void> {
  const carpeta = carpetaRespaldos(carpetaUserData)
  const archivoHoy = join(carpeta, nombreRespaldoDelDia(fecha))
  if (existsSync(archivoHoy)) return

  await db.backup(archivoHoy)

  for (const archivo of respaldosAEliminar(readdirSync(carpeta))) {
    unlinkSync(join(carpeta, archivo))
  }
}

export interface RespaldoInfo {
  archivo: string
  fecha: string
  tamanoBytes: number
}

/** Para mostrar en Admin > Respaldo qué respaldos automáticos existen ahora mismo. */
export function listarRespaldosAutomaticos(carpetaUserData: string): RespaldoInfo[] {
  const carpeta = carpetaRespaldos(carpetaUserData)
  return readdirSync(carpeta)
    .filter((f) => f.startsWith(PREFIJO_ARCHIVO) && f.endsWith(SUFIJO_ARCHIVO))
    .map((archivo) => {
      const stats = statSync(join(carpeta, archivo))
      return { archivo, fecha: stats.mtime.toISOString(), tamanoBytes: stats.size }
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Respaldo manual a donde el usuario elija — mismo mecanismo seguro que el automático. */
export async function exportarRespaldo(db: DB, rutaDestino: string): Promise<void> {
  await db.backup(rutaDestino)
}

// ============================================================
// Restaurar — sobrescribe la base viva con un archivo de respaldo. Más
// delicado que exportar, así que se parte en pasos chicos y explícitos
// (ver el orden exacto en admin:respaldo:restaurar, ipcAdmin.ts):
// validar el archivo elegido → respaldo de seguridad del estado actual →
// cerrar la conexión viva → sobrescribir → relanzar la app.
// ============================================================

/**
 * Confirma que un archivo es un respaldo real de esta app antes de
 * arriesgarse a usarlo — no toca la base viva ni nada más, solo abre y
 * lee el archivo elegido (abrirDb() ya truena solo si ni siquiera es un
 * SQLite válido).
 */
export function validarArchivoDeRespaldo(rutaArchivo: string): void {
  const db = abrirDb(rutaArchivo)
  try {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM estacionamientos').get() as { n: number }
    if (n === 0) {
      throw new Error('El archivo elegido no tiene ningún estacionamiento — no parece un respaldo válido de esta app.')
    }
  } finally {
    db.close()
  }
}

/** Respaldo de seguridad del estado ACTUAL, con nombre explícito — se toma justo antes de restaurar, por si el archivo elegido resultó ser el equivocado. */
export async function respaldoDeSeguridad(db: DB, carpetaUserData: string, fecha = new Date()): Promise<string> {
  const carpeta = carpetaRespaldos(carpetaUserData)
  const ruta = join(carpeta, `antes-de-restaurar-${fecha.toISOString().replace(/[:.]/g, '-')}.db`)
  await db.backup(ruta)
  return ruta
}

/**
 * Sobrescribe rutaDb con el contenido de rutaArchivoRespaldo. Quien llame
 * esto ya debe haber: (1) validado el archivo (validarArchivoDeRespaldo),
 * (2) tomado un respaldo de seguridad del estado actual, y (3) cerrado la
 * conexión viva a rutaDb (cerrarDb() en db.ts) — esta función no orquesta
 * nada de eso, solo hace la sobrescritura en disco.
 */
export async function restaurarDesdeArchivo(rutaArchivoRespaldo: string, rutaDb: string): Promise<void> {
  // Limpia rastros de la sesión WAL anterior de rutaDb — si quedan sueltos
  // y no coinciden con el archivo nuevo, pueden confundir a SQLite al
  // volver a abrirlo.
  for (const sufijo of ['-wal', '-shm', '-journal']) {
    const ruta = rutaDb + sufijo
    if (existsSync(ruta)) unlinkSync(ruta)
  }

  const origen = abrirDb(rutaArchivoRespaldo)
  try {
    await origen.backup(rutaDb)
  } finally {
    origen.close()
  }
}

import { randomBytes } from 'crypto'
import type { DB } from './index'

/**
 * Clave secreta para el cifrado del folio impreso/escaneado (ver
 * src/logic/folioCifrado.ts) — se genera una sola vez por estacionamiento
 * y de ahí en adelante siempre es la misma. Cambiarla dejaría ilegibles
 * (para efectos de cobro por escaneo) todos los tickets ya impresos con la
 * clave anterior, así que esta función nunca regenera una que ya existe.
 */
export function obtenerOCrearClaveFolio(db: DB, estacionamientoId: number): string {
  const fila = db
    .prepare<[number], { clave: string }>('SELECT clave FROM clave_cifrado_folio WHERE estacionamiento_id = ?')
    .get(estacionamientoId)
  if (fila) return fila.clave

  const clave = randomBytes(16).toString('hex')
  db.prepare('INSERT INTO clave_cifrado_folio (estacionamiento_id, clave) VALUES (?, ?)').run(estacionamientoId, clave)
  return clave
}

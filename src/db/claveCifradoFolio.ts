import { randomBytes } from 'crypto'
import type { DB } from './index'

/**
 * Clave secreta usada SOLO para generar códigos de facturación opacos
 * (ver formatearCodigoPago/formatearCodigoFacturacionBoleto en
 * src/logic/folioBarcode.ts) — el folio impreso/escaneado del boleto ya no
 * pasa por aquí (requisito SAT: debe ser el folio secuencial real, sin
 * cifrar). Se genera una sola vez por estacionamiento y de ahí en adelante
 * siempre es la misma. Cambiarla haría que los códigos de facturación ya
 * entregados (impresos en recibos, o guardados como referencia) dejaran de
 * coincidir con lo que hay en Firestore, así que esta función nunca
 * regenera una que ya existe.
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

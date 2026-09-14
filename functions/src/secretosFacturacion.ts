import { HttpsError } from 'firebase-functions/v2/https'
import { db } from './firestore'

/**
 * Documento `facturacionSecretos/{slug}` — se crea y mantiene A MANO por
 * cada estacionamiento (nunca desde la app de escritorio ni desde el
 * portal), directo en la consola de Firebase, al dar de alta su
 * organización en FacturAPI:
 *
 *   organizationId       — id de la organización en FacturAPI para el RFC de este estacionamiento
 *   secretKey             — Secret Key (live) de esa organización — NUNCA compartir ni exponer al cliente
 *   claveProductoServicio — clave de producto/servicio del catálogo SAT (ej. "78101803")
 *   claveUnidad           — clave de unidad del catálogo SAT (ej. "E48")
 *   descripcionServicio   — texto que aparece en el concepto del CFDI (ej. "Servicio de estacionamiento")
 *   codigoPostalFiscal    — CP fiscal del propio estacionamiento (el mismo que ya capturaste en la
 *                           app, tab Facturación) — lo necesita la factura global mensual porque,
 *                           por regla del SAT, el domicilio del receptor en un CFDI a público en
 *                           general (RFC XAXX010101000) debe ser el CP del propio emisor
 *   correoDestino         — OPCIONAL. La factura global mensual (crearFacturaGlobalMensual/
 *                           ...Pensionados) por default ya se manda sola a los mismos
 *                           destinatarios configurados para el corte de caja (la app los
 *                           sincroniza en cada latido — ver src/main/heartbeat.ts, campo
 *                           correoDestinatarios en estacionamientos/{slug}). Este campo es solo
 *                           para el caso raro de querer un destinatario DISTINTO para la factura
 *                           (ej. el contador en vez del dueño) — si se captura, tiene prioridad
 *                           sobre la lista automática.
 *
 * Reglas de Firestore (ver firestore.rules en la raíz del repo) bloquean
 * cualquier lectura/escritura de cliente sobre esta colección — solo el
 * Admin SDK (este backend) puede leerla.
 */
export interface SecretosFacturacion {
  organizationId: string
  secretKey: string
  claveProductoServicio: string
  claveUnidad: string
  descripcionServicio: string
  codigoPostalFiscal: string
  correoDestino?: string
}

export async function obtenerSecretosFacturacion(slug: string): Promise<SecretosFacturacion> {
  const snap = await db.doc(`facturacionSecretos/${slug}`).get()
  if (!snap.exists) {
    throw new HttpsError('failed-precondition', 'Este estacionamiento no tiene facturación configurada')
  }
  return snap.data() as SecretosFacturacion
}

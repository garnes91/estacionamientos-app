import { db } from './firestore'

/**
 * Lee la lista de destinatarios de correo que la app de escritorio ya
 * sincroniza sola en cada latido (misma lista que recibe el corte de caja,
 * ver src/main/heartbeat.ts y src/db/configuracionCorreo.ts en el repo de
 * la app) — así la factura global no obliga a capturar un correo aparte en
 * facturacionSecretos, a menos que se quiera uno distinto (ver
 * `correoDestino` ahí, que sigue teniendo prioridad si está presente).
 */
export async function obtenerCorreoDestinatarios(slug: string): Promise<string[]> {
  const snap = await db.doc(`estacionamientos/${slug}`).get()
  const destinatarios = snap.data()?.correoDestinatarios as string | undefined
  if (!destinatarios) return []
  return destinatarios
    .split(',')
    .map((correo) => correo.trim())
    .filter(Boolean)
}

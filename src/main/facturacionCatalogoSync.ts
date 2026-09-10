import type { DB } from '../db'
import { obtenerConfiguracionFacturacion } from '../db/configuracionFacturacion'
import { obtenerConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { parchearDocumento } from './firestoreRest'

/**
 * Sube a `facturacionSecretos/{slug}` los campos de Admin > Facturación
 * que NO son secretos (clave de producto/servicio, clave de unidad,
 * descripción del servicio, código postal fiscal) — así no hay que
 * volver a capturarlos a mano en Firebase Console cada vez que cambien.
 *
 * A propósito NUNCA toca `organizationId` ni `secretKey`: esos siguen
 * siendo 100% manuales, nunca pasan por ningún cliente (ver
 * functions/src/secretosFacturacion.ts). firestore.rules solo deja
 * escribir estos 4 campos desde un cliente autenticado, cualquier otro
 * campo queda denegado — así aunque alguien intentara mandar otra cosa
 * por este mismo camino, no se le haría caso.
 *
 * Se llama al guardar Admin > Facturación (ver admin:facturacion:guardar
 * en ipcAdmin.ts). Si el documento en Firestore todavía no existe (nadie
 * ha dado de alta organizationId/secretKey a mano todavía), el `update`
 * simplemente falla y se ignora — no hay nada que fusionar todavía.
 *
 * Nunca lanza: un fallo de red no debe tumbar el guardado de la
 * configuración local, que ya quedó guardada de todas formas.
 */
export async function sincronizarCatalogoFacturacion(db: DB, estacionamientoId: number): Promise<void> {
  const facturacion = obtenerConfiguracionFacturacion(db, estacionamientoId)
  if (!facturacion?.habilitado) return

  const firebase = obtenerConfiguracionMonitoreo(db, estacionamientoId)
  if (!firebase) return

  try {
    await parchearDocumento(firebase, `facturacionSecretos/${firebase.slug}`, {
      claveProductoServicio: { stringValue: facturacion.claveProductoServicio },
      claveUnidad: { stringValue: facturacion.claveUnidad },
      descripcionServicio: { stringValue: facturacion.descripcionServicio },
      codigoPostalFiscal: { stringValue: facturacion.codigoPostalFiscal }
    })
  } catch (error) {
    console.error('[facturacion] no se pudo sincronizar el catálogo a Firestore:', error)
  }
}

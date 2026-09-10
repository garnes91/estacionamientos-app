import type { DB } from '../db'
import type { PagoPensionado } from '../db/pensionados'
import { obtenerOCrearClaveFolio } from '../db/claveCifradoFolio'
import { obtenerConfiguracionFacturacion } from '../db/configuracionFacturacion'
import { obtenerConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { formatearCodigoPago } from '../logic/folioBarcode'
import { parchearDocumento } from './firestoreRest'

/**
 * Sube un pago de pensionado recién registrado a Firestore, para que el
 * MISMO portal público de autofacturación (portal-facturacion/) lo pueda
 * encontrar por el código que trae impreso su recibo — igual que
 * facturacionSync.ts hace con los boletos, pero en una colección aparte
 * (pagosPensionadosFacturables) porque un pago no es un boleto: no tiene
 * serie ni se escanea. Cada PAGO (no cada pensionado) tiene su propio
 * código — el de septiembre nunca puede facturar el de octubre, porque son
 * documentos de Firestore completamente distintos.
 *
 * Nunca lanza: un fallo de red no debe tumbar el registro del pago, que ya
 * quedó guardado localmente de todas formas.
 */
export async function sincronizarPagoPensionado(db: DB, estacionamientoId: number, pago: PagoPensionado): Promise<void> {
  const facturacion = obtenerConfiguracionFacturacion(db, estacionamientoId)
  if (!facturacion?.habilitado) return

  const firebase = obtenerConfiguracionMonitoreo(db, estacionamientoId)
  if (!firebase) return

  try {
    const fila = db
      .prepare<[number], { nombre: string }>('SELECT nombre FROM pensionados WHERE id = ?')
      .get(pago.pensionadoId)
    const pensionadoNombre = fila?.nombre ?? ''

    const claveFolio = obtenerOCrearClaveFolio(db, estacionamientoId)
    const codigo = formatearCodigoPago(pago.id, claveFolio)

    await parchearDocumento(firebase, `estacionamientos/${firebase.slug}/pagosPensionadosFacturables/${codigo}`, {
      pensionadoNombre: { stringValue: pensionadoNombre },
      periodoDesde: { timestampValue: pago.periodoDesde },
      periodoHasta: { timestampValue: pago.periodoHasta },
      monto: { doubleValue: pago.monto },
      fecha: { timestampValue: pago.periodoDesde },
      facturado: { booleanValue: false }
    })
  } catch (error) {
    console.error('[facturacion] no se pudo sincronizar el pago de pensionado a Firestore:', error)
  }
}

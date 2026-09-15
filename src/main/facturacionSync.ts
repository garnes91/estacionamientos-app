import type { DB } from '../db'
import type { BoletoCerrado } from '../db/boletos'
import { obtenerOCrearClaveFolio } from '../db/claveCifradoFolio'
import { obtenerConfiguracionFacturacion } from '../db/configuracionFacturacion'
import { obtenerConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { formatearCodigoFacturacionBoleto } from '../logic/folioBarcode'
import { parchearDocumento } from './firestoreRest'

/**
 * Sube un boleto recién cerrado a Firestore para que el portal público de
 * autofacturación individual (portal-facturacion/) y la pestaña de
 * facturación global del panel del operador (panel-operador/, fuera de
 * este repo) puedan encontrarlo por su código de facturación
 * (formatearCodigoFacturacionBoleto) — la llave del documento es ese
 * código, propio y desacoplado del folio impreso en el ticket (ese ahora
 * es plano, por requisito del SAT; ver src/logic/folioBarcode.ts), así
 * ninguna de esas dos páginas necesita conocer la clave de cifrado del
 * estacionamiento.
 *
 * Reutiliza el mismo proyecto Firebase que ya usa el monitoreo/panel del
 * operador (configuracion_monitoreo) — decisión tomada al diseñar esta
 * feature para no duplicar credenciales. Si el estacionamiento no tiene
 * facturación habilitada, o no tiene un proyecto Firebase configurado, no
 * hace nada.
 *
 * Nunca lanza: un fallo de red no debe tumbar el cobro de un boleto, que ya
 * quedó guardado localmente de todas formas. El boleto sin sincronizar
 * simplemente no aparecerá aún en ninguna de esas páginas, pero tampoco se
 * pierde: al facturarlo (individual o global) todo pasa en Firestore, esta
 * base local no participa en esa decisión.
 */
export async function sincronizarBoletoCerrado(db: DB, estacionamientoId: number, boleto: BoletoCerrado): Promise<void> {
  const facturacion = obtenerConfiguracionFacturacion(db, estacionamientoId)
  if (!facturacion?.habilitado) return

  const firebase = obtenerConfiguracionMonitoreo(db, estacionamientoId)
  if (!firebase) return

  try {
    const claveFolio = obtenerOCrearClaveFolio(db, estacionamientoId)
    const codigoFactura = formatearCodigoFacturacionBoleto(boleto.id, claveFolio)

    await parchearDocumento(firebase, `estacionamientos/${firebase.slug}/boletosFacturables/${codigoFactura}`, {
      serie: { stringValue: boleto.serie },
      // Folio REAL, plano (ya no se cifra, requisito SAT) — para que la
      // factura global lo muestre desglosado por boleto (ver
      // crearFacturaGlobalMensual en el repo de Cloud Functions). No es
      // sensible: nunca se expone al público por este medio, solo va
      // dentro del CFDI que recibe el dueño/contador.
      folio: { integerValue: String(boleto.folio) },
      monto: { doubleValue: boleto.monto },
      fecha: { timestampValue: boleto.horaSalida },
      facturado: { booleanValue: false }
    })
  } catch (error) {
    console.error('[facturacion] no se pudo sincronizar el boleto a Firestore:', error)
  }
}

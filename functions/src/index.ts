import { onCall, HttpsError } from 'firebase-functions/v2/https'
import Facturapi from 'facturapi'
import { db } from './firestore'
import { obtenerSecretosFacturacion } from './secretosFacturacion'

export { crearFacturaGlobalMensual } from './facturaGlobalMensual'
export { crearSocio } from './socios'

interface ReceptorInput {
  rfc: string
  razonSocial: string
  usoCFDI: string
  regimenFiscal: string
  codigoPostal: string
  email: string
}

interface CrearFacturaIndividualInput {
  slug: string
  codigoImpreso: string
  receptor: ReceptorInput
}

function validarInput(data: Partial<CrearFacturaIndividualInput>): CrearFacturaIndividualInput {
  const receptor = data.receptor
  if (
    !data.slug ||
    !data.codigoImpreso ||
    !receptor?.rfc ||
    !receptor.razonSocial ||
    !receptor.usoCFDI ||
    !receptor.regimenFiscal ||
    !receptor.codigoPostal ||
    !receptor.email
  ) {
    throw new HttpsError('invalid-argument', 'Faltan datos del boleto o del receptor de la factura')
  }
  return data as CrearFacturaIndividualInput
}

/**
 * Facturación individual, a petición del cliente, desde el portal público.
 * Ver Fase 3 del plan de facturación (plans/facturacion-cfdi.md en el repo
 * principal): el boleto vive en Firestore en
 * `estacionamientos/{slug}/boletosFacturables/{codigoImpreso}`, subido por
 * la app de escritorio al cerrar el boleto (ver src/main/facturacionSync.ts
 * del repo de la app).
 */
export const crearFacturaIndividual = onCall(async (request) => {
  const { slug, codigoImpreso, receptor } = validarInput((request.data ?? {}) as Partial<CrearFacturaIndividualInput>)

  const boletoRef = db.doc(`estacionamientos/${slug}/boletosFacturables/${codigoImpreso}`)

  // Se marca `facturado` DENTRO de una transacción y ANTES de timbrar, para
  // que dos solicitudes por el mismo folio (dos pestañas, un doble clic, o
  // que llegue justo cuando corre la factura global mensual del mes
  // anterior) no puedan facturarlo dos veces.
  const boleto = await db.runTransaction(async (tx) => {
    const snap = await tx.get(boletoRef)
    if (!snap.exists) {
      throw new HttpsError('not-found', 'No se encontró un boleto con ese folio, o ya venció el plazo para facturarlo')
    }
    const datos = snap.data()!
    if (datos.facturado) {
      throw new HttpsError('already-exists', 'Este boleto ya fue facturado')
    }
    tx.update(boletoRef, { facturado: true, facturaEstado: 'en_proceso' })
    return { monto: datos.monto as number, serie: datos.serie as string }
  })

  try {
    const secretos = await obtenerSecretosFacturacion(slug)
    const facturapi = new Facturapi(secretos.secretKey)

    // OJO: verificar los nombres exactos de campos contra la documentación
    // viva de FacturAPI (docs.facturapi.io) al conectar la primera cuenta
    // real — este cuerpo sigue su formato documentado, pero no se ha
    // probado contra la API real todavía.
    const factura = await facturapi.invoices.create({
      customer: {
        legal_name: receptor.razonSocial,
        tax_id: receptor.rfc,
        tax_system: receptor.regimenFiscal,
        email: receptor.email,
        address: { zip: receptor.codigoPostal }
      },
      items: [
        {
          quantity: 1,
          product: {
            // El código del ticket que se muestra al cliente es el CIFRADO
            // (el mismo que trae impreso el boleto) — nunca el folio
            // secuencial interno, que revelaría el volumen real de boletos.
            description: `${secretos.descripcionServicio || 'Servicio de estacionamiento'} — ticket ${codigoImpreso}`,
            product_key: secretos.claveProductoServicio,
            unit_key: secretos.claveUnidad,
            price: boleto.monto,
            tax_included: true,
            taxes: [{ type: 'IVA', rate: 0.16 }]
          }
        }
      ],
      use: receptor.usoCFDI,
      payment_form: '01', // Efectivo — el estacionamiento solo cobra en efectivo hoy
      payment_method: 'PUE'
    })

    await facturapi.invoices.sendByEmail(factura.id, { email: receptor.email })

    await boletoRef.update({
      facturaEstado: 'completado',
      facturaFolioFiscal: factura.uuid
    })

    return { folioFiscal: factura.uuid }
  } catch (error) {
    // Falló el timbrado (o el envío) — se desmarca para poder reintentar,
    // no se deja el boleto "facturado" a medias sin CFDI real detrás.
    await boletoRef.update({ facturado: false, facturaEstado: 'error' })
    console.error(`[facturacion] error al timbrar folio ${codigoImpreso} de ${slug}:`, error)
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'No se pudo generar la factura. Intenta de nuevo más tarde.')
  }
})

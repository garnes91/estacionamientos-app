import { onCall, HttpsError } from 'firebase-functions/v2/https'
import Facturapi from 'facturapi'
import { db } from './firestore'
import { obtenerSecretosFacturacion } from './secretosFacturacion'

export { crearFacturaGlobalMensual } from './facturaGlobalMensual'
export { crearFacturaGlobalMensualPensionados } from './pensionadosFacturaGlobalMensual'
export { crearSocio, eliminarSocio } from './socios'

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

interface ItemFacturable {
  monto: number
  descripcion: string
  ref: FirebaseFirestore.DocumentReference
}

function formatearFecha(valor: unknown): string {
  const fecha = typeof (valor as { toDate?: () => Date })?.toDate === 'function' ? (valor as { toDate: () => Date }).toDate() : new Date(valor as string)
  return fecha.toLocaleDateString('es-MX')
}

/**
 * Busca el código en las dos colecciones posibles (un boleto normal, o un
 * pago de pensionado — ver src/main/pensionadosFacturacionSync.ts del repo
 * de la app) y marca `facturado` DENTRO de una transacción y ANTES de
 * timbrar, para que dos solicitudes por el mismo código (dos pestañas, un
 * doble clic, o que llegue justo cuando corre la factura global mensual)
 * no puedan facturarlo dos veces. El cliente que pide la factura nunca
 * necesita saber si su código es de un boleto o de una mensualidad — pega
 * un solo código en el mismo formulario del portal.
 */
async function localizarYMarcarFacturado(slug: string, codigo: string): Promise<ItemFacturable> {
  const boletoRef = db.doc(`estacionamientos/${slug}/boletosFacturables/${codigo}`)
  const pagoRef = db.doc(`estacionamientos/${slug}/pagosPensionadosFacturables/${codigo}`)

  return db.runTransaction(async (tx) => {
    const [boletoSnap, pagoSnap] = await Promise.all([tx.get(boletoRef), tx.get(pagoRef)])

    if (boletoSnap.exists) {
      const datos = boletoSnap.data()!
      if (datos.facturado) {
        throw new HttpsError('already-exists', 'Este boleto ya fue facturado')
      }
      tx.update(boletoRef, { facturado: true, facturaEstado: 'en_proceso' })
      // El código que ve el cliente es el CIFRADO (el mismo que trae
      // impreso el boleto) — nunca el folio secuencial interno, que
      // revelaría el volumen real de boletos.
      return { monto: datos.monto as number, descripcion: `ticket ${codigo}`, ref: boletoRef }
    }

    if (pagoSnap.exists) {
      const datos = pagoSnap.data()!
      if (datos.facturado) {
        throw new HttpsError('already-exists', 'Este pago ya fue facturado')
      }
      tx.update(pagoRef, { facturado: true, facturaEstado: 'en_proceso' })
      const periodo = `${formatearFecha(datos.periodoDesde)} - ${formatearFecha(datos.periodoHasta)}`
      return {
        monto: datos.monto as number,
        descripcion: `mensualidad de ${datos.pensionadoNombre || 'pensionado'}, periodo ${periodo}`,
        ref: pagoRef
      }
    }

    throw new HttpsError('not-found', 'No se encontró nada con ese código, o ya venció el plazo para facturarlo')
  })
}

/**
 * Facturación individual, a petición del cliente, desde el portal público.
 * Ver Fase 3 del plan de facturación (plans/facturacion-cfdi.md en el repo
 * principal): el boleto/pago vive en Firestore en
 * `estacionamientos/{slug}/boletosFacturables/{codigoImpreso}` o
 * `estacionamientos/{slug}/pagosPensionadosFacturables/{codigoImpreso}`,
 * subido por la app de escritorio al cerrar el boleto o registrar el pago
 * (ver src/main/facturacionSync.ts y src/main/pensionadosFacturacionSync.ts
 * del repo de la app).
 */
export const crearFacturaIndividual = onCall(async (request) => {
  const { slug, codigoImpreso, receptor } = validarInput((request.data ?? {}) as Partial<CrearFacturaIndividualInput>)

  const item = await localizarYMarcarFacturado(slug, codigoImpreso)

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
            description: `${secretos.descripcionServicio || 'Servicio de estacionamiento'} — ${item.descripcion}`,
            product_key: secretos.claveProductoServicio,
            unit_key: secretos.claveUnidad,
            price: item.monto,
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

    await item.ref.update({
      facturaEstado: 'completado',
      facturaFolioFiscal: factura.uuid
    })

    return { folioFiscal: factura.uuid }
  } catch (error) {
    // Falló el timbrado (o el envío) — se desmarca para poder reintentar,
    // no se deja "facturado" a medias sin CFDI real detrás.
    await item.ref.update({ facturado: false, facturaEstado: 'error' })
    console.error(`[facturacion] error al timbrar código ${codigoImpreso} de ${slug}:`, error)
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'No se pudo generar la factura. Intenta de nuevo más tarde.')
  }
})

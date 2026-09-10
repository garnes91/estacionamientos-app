import { onRequest } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import Facturapi from 'facturapi'
import { db } from './firestore'
import { obtenerSecretosFacturacion } from './secretosFacturacion'

interface CrearFacturaGlobalPensionadosInput {
  slug: string
}

interface ResultadoFacturaGlobal {
  folioFiscal: string | null
  cantidadPagos: number
  montoTotal: number
}

function inicioMesActual(): Date {
  const fecha = new Date()
  fecha.setUTCDate(1)
  fecha.setUTCHours(0, 0, 0, 0)
  return fecha
}

/**
 * Gemela de crearFacturaGlobalMensual (facturaGlobalMensual.ts) pero para
 * pagos de pensionados en vez de boletos — misma idea, sin el concepto de
 * "serie" (los pensionados no tienen una). Factura TODO lo que siga sin
 * facturar de meses YA CERRADOS (nunca el mes en curso — el pensionado
 * todavía tiene ese mes completo para pedir su factura individual desde el
 * portal con el código de SU recibo).
 *
 * A propósito no se dispara sola: la llama a mano quien decida cuándo
 * facturar, desde panel-operador/index.html (pestaña "Facturación
 * global" → botón "Facturar pensionados pendientes").
 */
export const crearFacturaGlobalMensualPensionados = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!idToken) {
    res.status(401).json({ error: 'Falta autenticación' })
    return
  }
  try {
    await getAuth().verifyIdToken(idToken)
  } catch {
    res.status(401).json({ error: 'Token inválido' })
    return
  }

  const { slug } = (req.body ?? {}) as Partial<CrearFacturaGlobalPensionadosInput>
  if (!slug) {
    res.status(400).json({ error: 'Falta el estacionamiento' })
    return
  }

  const coleccion = db.collection(`estacionamientos/${slug}/pagosPensionadosFacturables`)
  const pendientesSnap = await coleccion.where('facturado', '==', false).get()

  const limiteMesActual = inicioMesActual()
  const elegibles = pendientesSnap.docs.filter((doc) => {
    const fecha = doc.data().fecha
    const fechaDate = typeof fecha?.toDate === 'function' ? fecha.toDate() : new Date(fecha)
    return fechaDate < limiteMesActual
  })

  if (elegibles.length === 0) {
    const resultado: ResultadoFacturaGlobal = { folioFiscal: null, cantidadPagos: 0, montoTotal: 0 }
    res.status(200).json(resultado)
    return
  }

  let montoTotal = 0
  let refsAFacturar: FirebaseFirestore.DocumentReference[] = []

  try {
    await db.runTransaction(async (tx) => {
      montoTotal = 0
      refsAFacturar = []
      // Se vuelve a leer cada doc DENTRO de la transacción (no se confía en
      // el snapshot del query de arriba) por si cambió algo entre el query
      // y aquí — ej. el pensionado ya lo facturó individual justo en medio.
      const snaps = await Promise.all(elegibles.map((doc) => tx.get(doc.ref)))
      for (const snap of snaps) {
        if (!snap.exists) continue
        const datos = snap.data()!
        if (datos.facturado) continue
        montoTotal += datos.monto as number
        refsAFacturar.push(snap.ref)
      }
      for (const ref of refsAFacturar) {
        tx.update(ref, { facturado: true, facturaEstado: 'en_proceso' })
      }
    })

    if (refsAFacturar.length === 0) {
      const resultado: ResultadoFacturaGlobal = { folioFiscal: null, cantidadPagos: 0, montoTotal: 0 }
      res.status(200).json(resultado)
      return
    }

    const secretos = await obtenerSecretosFacturacion(slug)
    const facturapi = new Facturapi(secretos.secretKey)

    const factura = await facturapi.invoices.create({
      customer: {
        legal_name: 'PUBLICO EN GENERAL',
        tax_id: 'XAXX010101000',
        tax_system: '616',
        address: { zip: secretos.codigoPostalFiscal }
      },
      items: [
        {
          quantity: 1,
          product: {
            description: `${secretos.descripcionServicio || 'Servicio de estacionamiento'} — factura global de pensionados, generada ${new Date().toISOString().slice(0, 10)}`,
            product_key: secretos.claveProductoServicio,
            unit_key: secretos.claveUnidad,
            price: montoTotal,
            tax_included: true,
            taxes: [{ type: 'IVA', rate: 0.16 }]
          }
        }
      ],
      use: 'S01', // Sin efectos fiscales — obligatorio para receptor genérico
      payment_form: '01', // Efectivo
      payment_method: 'PUE'
    })

    await Promise.all(
      refsAFacturar.map((ref) => ref.update({ facturaEstado: 'completado', facturaFolioFiscal: factura.uuid }))
    )

    const resultado: ResultadoFacturaGlobal = {
      folioFiscal: factura.uuid,
      cantidadPagos: refsAFacturar.length,
      montoTotal
    }
    res.status(200).json(resultado)
  } catch (error) {
    // Deshace el "facturado" de los que sí se alcanzaron a marcar, para que
    // el siguiente intento manual los vuelva a tomar en cuenta.
    await Promise.all(
      refsAFacturar.map((ref) => ref.update({ facturado: false, facturaEstado: 'error' }).catch(() => {}))
    )
    console.error(`[facturacion] error en factura global de pensionados de ${slug}:`, error)
    res.status(500).json({ error: 'No se pudo generar la factura global' })
  }
})

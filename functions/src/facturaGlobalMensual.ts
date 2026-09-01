import { onRequest } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import Facturapi from 'facturapi'
import { db } from './firestore'
import { obtenerSecretosFacturacion } from './secretosFacturacion'

interface CrearFacturaGlobalInput {
  slug: string
  serie: string
}

interface ResultadoFacturaGlobal {
  folioFiscal: string | null
  cantidadBoletos: number
  montoTotal: number
}

function inicioMesActual(): Date {
  const fecha = new Date()
  fecha.setUTCDate(1)
  fecha.setUTCHours(0, 0, 0, 0)
  return fecha
}

/**
 * Factura global de "público en general" para una serie de un
 * estacionamiento, con TODO lo que siga sin facturar de meses YA
 * CERRADOS (nunca del mes en curso — el cliente todavía tiene ese mes
 * completo para pedir su factura individual desde el portal).
 *
 * A propósito NO se dispara sola ni por horario: la llama a mano quien
 * decida cuándo facturar (el dueño o el contador) desde
 * panel-facturacion/index.html, un botón por serie — así cada quien
 * controla el momento exacto de un acto con efectos fiscales reales, y
 * puede facturar una serie sin tocar la otra.
 *
 * `onRequest` llano (no `onCall`): la llama un navegador con `fetch` normal
 * después de autenticarse anónimo contra Firebase (mismo patrón que
 * dashboard/panel-remoto), no el SDK de Cloud Functions.
 *
 * Nunca confía en montos ajenos: siempre relee `monto`/`facturado` de
 * Firestore dentro de una transacción antes de timbrar, así que como mucho
 * un llamado repetido o mal intencionado adelanta una facturación real que
 * de todas formas iba a pasar — nunca inventa ni duplica montos.
 */
export const crearFacturaGlobalMensual = onRequest(async (req, res) => {
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

  const { slug, serie } = (req.body ?? {}) as Partial<CrearFacturaGlobalInput>
  if (!slug || !serie) {
    res.status(400).json({ error: 'Falta el estacionamiento o la serie' })
    return
  }

  // Consulta de solo-igualdad (serie + facturado) — no necesita índice
  // compuesto propio en Firestore. El filtro de fecha (solo meses ya
  // cerrados) se aplica en memoria sobre este resultado, ya en el rango de
  // pendientes de esta serie, que para un estacionamiento normal es chico.
  const coleccion = db.collection(`estacionamientos/${slug}/boletosFacturables`)
  const pendientesSnap = await coleccion.where('serie', '==', serie).where('facturado', '==', false).get()

  const limiteMesActual = inicioMesActual()
  const elegibles = pendientesSnap.docs.filter((doc) => {
    const fecha = doc.data().fecha
    const fechaDate = typeof fecha?.toDate === 'function' ? fecha.toDate() : new Date(fecha)
    return fechaDate < limiteMesActual
  })

  if (elegibles.length === 0) {
    const resultado: ResultadoFacturaGlobal = { folioFiscal: null, cantidadBoletos: 0, montoTotal: 0 }
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
      // y aquí — ej. alguien lo facturó individual justo en medio.
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
      const resultado: ResultadoFacturaGlobal = { folioFiscal: null, cantidadBoletos: 0, montoTotal: 0 }
      res.status(200).json(resultado)
      return
    }

    const secretos = await obtenerSecretosFacturacion(slug)
    const facturapi = new Facturapi(secretos.secretKey)

    // OJO: verificar los nombres exactos de campos contra la documentación
    // viva de FacturAPI al conectar la primera cuenta real — igual que en
    // crearFacturaIndividual.ts, no se ha probado contra la API real.
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
            description: `${secretos.descripcionServicio || 'Servicio de estacionamiento'} — factura global serie ${serie}, generada ${new Date().toISOString().slice(0, 10)}`,
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

    const resultado: ResultadoFacturaGlobal = { folioFiscal: factura.uuid, cantidadBoletos: refsAFacturar.length, montoTotal }
    res.status(200).json(resultado)
  } catch (error) {
    // Deshace el "facturado" de los que sí se alcanzaron a marcar, para que
    // el siguiente intento manual los vuelva a tomar en cuenta.
    await Promise.all(
      refsAFacturar.map((ref) => ref.update({ facturado: false, facturaEstado: 'error' }).catch(() => {}))
    )
    console.error(`[facturacion] error en factura global de ${slug} serie ${serie}:`, error)
    res.status(500).json({ error: 'No se pudo generar la factura global' })
  }
})

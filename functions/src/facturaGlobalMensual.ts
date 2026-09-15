import { onRequest } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import Facturapi from 'facturapi'
import { db } from './firestore'
import { obtenerSecretosFacturacion } from './secretosFacturacion'
import { obtenerCorreoDestinatarios } from './correoDestinatarios'
import { formatearFecha } from './formatearFecha'

interface CrearFacturaGlobalInput {
  slug: string
  serie: string
}

interface ResultadoFacturaGlobal {
  folioFiscal: string | null
  cantidadBoletos: number
  montoTotal: number
  foliosSinExplicar: number[]
}

function inicioMesActual(): Date {
  const fecha = new Date()
  fecha.setUTCDate(1)
  fecha.setUTCHours(0, 0, 0, 0)
  return fecha
}

/**
 * El SAT exige que los folios de una serie sean consecutivos — un hueco en
 * la secuencia solo es válido si corresponde a un boleto que YA se facturó
 * por su cuenta (individual, desde el portal, o en un corte global
 * anterior). Revisa el rango [folio mínimo, folio máximo] de lo que se está
 * facturando ahora y, para cada folio que falte ahí, busca su documento en
 * Firestore:
 *   - No existe, o existe pero sigue `facturado:false` de un mes YA
 *     cerrado (no debería pasar nunca, la query principal ya lo hubiera
 *     tomado en esta misma corrida) → SIN EXPLICAR, se reporta.
 *   - `facturado:true` → ya se facturó por su cuenta, hueco explicado.
 *   - `facturado:false` pero de un mes AÚN EN CURSO → todavía no le toca
 *     (el cliente sigue teniendo ese mes completo para pedir su factura
 *     individual), hueco explicado.
 * Nunca bloquea la facturación — es información para que el dueño/contador
 * revise, no una regla dura del código (que no puede saber, por ejemplo, si
 * un folio faltante corresponde a un boleto perdido/cancelado).
 */
async function buscarFoliosSinExplicar(
  slug: string,
  serie: string,
  limiteMesActual: Date,
  boletosAFacturar: { folio: number | null }[]
): Promise<number[]> {
  const folios = boletosAFacturar.map((b) => b.folio).filter((f): f is number => f != null)
  if (folios.length < 2) return []

  const folioMin = Math.min(...folios)
  const folioMax = Math.max(...folios)
  const presentes = new Set(folios)
  const huecos: number[] = []
  for (let f = folioMin; f <= folioMax; f++) {
    if (!presentes.has(f)) huecos.push(f)
  }
  if (huecos.length === 0) return []

  const coleccion = db.collection(`estacionamientos/${slug}/boletosFacturables`)
  const sinExplicar: number[] = []
  for (const folio of huecos) {
    const snap = await coleccion.where('serie', '==', serie).where('folio', '==', folio).limit(1).get()
    if (snap.empty) {
      sinExplicar.push(folio)
      continue
    }
    const datos = snap.docs[0].data()
    if (datos.facturado === true) continue // ya facturado por su cuenta — explicado

    const fecha = datos.fecha
    const fechaDate = typeof fecha?.toDate === 'function' ? fecha.toDate() : new Date(fecha)
    if (fechaDate >= limiteMesActual) continue // del mes en curso, aún no le toca — explicado

    sinExplicar.push(folio)
  }
  return sinExplicar
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
export const crearFacturaGlobalMensual = onRequest({ cors: true }, async (req, res) => {
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
    const resultado: ResultadoFacturaGlobal = { folioFiscal: null, cantidadBoletos: 0, montoTotal: 0, foliosSinExplicar: [] }
    res.status(200).json(resultado)
    return
  }

  interface BoletoAFacturar {
    ref: FirebaseFirestore.DocumentReference
    monto: number
    fecha: unknown
    folio: number | null
  }

  let montoTotal = 0
  let boletosAFacturar: BoletoAFacturar[] = []

  try {
    await db.runTransaction(async (tx) => {
      montoTotal = 0
      boletosAFacturar = []
      // Se vuelve a leer cada doc DENTRO de la transacción (no se confía en
      // el snapshot del query de arriba) por si cambió algo entre el query
      // y aquí — ej. alguien lo facturó individual justo en medio.
      const snaps = await Promise.all(elegibles.map((doc) => tx.get(doc.ref)))
      for (const snap of snaps) {
        if (!snap.exists) continue
        const datos = snap.data()!
        if (datos.facturado) continue
        montoTotal += datos.monto as number
        boletosAFacturar.push({
          ref: snap.ref,
          monto: datos.monto as number,
          fecha: datos.fecha,
          // Boletos sincronizados ANTES de este cambio no traen folio —
          // se cae al formato anterior (con fecha) para esos casos.
          folio: typeof datos.folio === 'number' ? datos.folio : null
        })
      }
      for (const boleto of boletosAFacturar) {
        tx.update(boleto.ref, { facturado: true, facturaEstado: 'en_proceso' })
      }
    })

    if (boletosAFacturar.length === 0) {
      const resultado: ResultadoFacturaGlobal = { folioFiscal: null, cantidadBoletos: 0, montoTotal: 0, foliosSinExplicar: [] }
      res.status(200).json(resultado)
      return
    }

    const secretos = await obtenerSecretosFacturacion(slug)
    const facturapi = new Facturapi(secretos.secretKey)

    // OJO: verificar los nombres exactos de campos contra la documentación
    // viva de FacturAPI al conectar la primera cuenta real — igual que en
    // crearFacturaIndividual.ts, no se ha probado contra la API real.
    // Un renglón POR BOLETO (no un solo total sumado) — así el desglose
    // real queda en el CFDI, no solo en Firestore.
    const factura = await facturapi.invoices.create({
      customer: {
        legal_name: 'PUBLICO EN GENERAL',
        tax_id: 'XAXX010101000',
        tax_system: '616',
        address: { zip: secretos.codigoPostalFiscal }
      },
      items: boletosAFacturar.map((boleto) => ({
        quantity: 1,
        product: {
          // Folio REAL (ya no se cifra, requisito SAT) — a diferencia del
          // código de facturación (ese sí cifrado, ver
          // formatearCodigoFacturacionBoleto en el repo de la app), aquí no
          // hay riesgo: este texto solo lo ve el dueño/contador dentro del
          // CFDI, nunca el cliente.
          description:
            boleto.folio != null
              ? `${secretos.descripcionServicio || 'Servicio de estacionamiento'} — Boleto ${serie}-${boleto.folio}`
              : `${secretos.descripcionServicio || 'Servicio de estacionamiento'} — boleto serie ${serie}, ${formatearFecha(boleto.fecha)}`,
          product_key: secretos.claveProductoServicio,
          unit_key: secretos.claveUnidad,
          price: boleto.monto,
          tax_included: true,
          taxes: [{ type: 'IVA', rate: 0.16 }]
        }
      })),
      use: 'S01', // Sin efectos fiscales — obligatorio para receptor genérico
      payment_form: '01', // Efectivo
      payment_method: 'PUE'
    })

    // Es "público en general" — no hay un cliente a quien ya se le mandó
    // sola (a diferencia de crearFacturaIndividual). Por default se manda a
    // los mismos destinatarios que ya reciben el corte de caja (la app los
    // sincroniza sola en cada latido); `correoDestino` en
    // facturacionSecretos, si está presente, manda ahí en vez de eso.
    const destinatarios = secretos.correoDestino ? [secretos.correoDestino] : await obtenerCorreoDestinatarios(slug)
    if (destinatarios.length > 0) {
      await facturapi.invoices.sendByEmail(factura.id, { email: destinatarios })
    }

    await Promise.all(
      boletosAFacturar.map((boleto) => boleto.ref.update({ facturaEstado: 'completado', facturaFolioFiscal: factura.uuid }))
    )

    const foliosSinExplicar = await buscarFoliosSinExplicar(slug, serie, limiteMesActual, boletosAFacturar)

    const resultado: ResultadoFacturaGlobal = {
      folioFiscal: factura.uuid,
      cantidadBoletos: boletosAFacturar.length,
      montoTotal,
      foliosSinExplicar
    }
    res.status(200).json(resultado)
  } catch (error) {
    // Deshace el "facturado" de los que sí se alcanzaron a marcar, para que
    // el siguiente intento manual los vuelva a tomar en cuenta.
    await Promise.all(
      boletosAFacturar.map((boleto) => boleto.ref.update({ facturado: false, facturaEstado: 'error' }).catch(() => {}))
    )
    console.error(`[facturacion] error en factura global de ${slug} serie ${serie}:`, error)
    res.status(500).json({ error: 'No se pudo generar la factura global' })
  }
})

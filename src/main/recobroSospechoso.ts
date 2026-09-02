import nodemailer from 'nodemailer'
import type { DB } from '../db'
import { DetalleIntentoRecobro, obtenerDetalleIntentoRecobro, RecobroSospechosoError } from '../db/boletos'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerConfiguracionCorreo } from '../db/configuracionCorreo'
import { obtenerConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { parchearDocumento } from './firestoreRest'

async function avisarPorCorreo(db: DB, estacionamientoNombre: string, estacionamientoId: number, detalle: DetalleIntentoRecobro): Promise<void> {
  const config = obtenerConfiguracionCorreo(db, estacionamientoId)
  if (!config) return

  const transportador = nodemailer.createTransport({
    host: config.host,
    port: config.puerto,
    secure: config.seguro,
    auth: { user: config.usuario, pass: config.password }
  })

  await transportador.sendMail({
    from: config.remitente,
    to: config.destinatarios,
    subject: `Boleto reciclado — ${estacionamientoNombre}`,
    text:
      `El boleto ${detalle.serie}-${detalle.folio} (${detalle.tipoVehiculo}) ya estaba cobrado y se volvió a ` +
      `escanear ${detalle.intentos} veces. Último intento: ${detalle.nombreUsuario}.\n\n` +
      `Esto puede ser un boleto reciclado a propósito para cobrarlo dos veces — revísalo con el equipo.`
  })
}

async function avisarPorFirestore(db: DB, estacionamientoId: number, detalle: DetalleIntentoRecobro, boletoId: number): Promise<void> {
  const firebase = obtenerConfiguracionMonitoreo(db, estacionamientoId)
  if (!firebase || !firebase.habilitado) return

  await parchearDocumento(firebase, `estacionamientos/${firebase.slug}/alertasRecobro/${boletoId}`, {
    serie: { stringValue: detalle.serie },
    folio: { integerValue: String(detalle.folio) },
    tipoVehiculo: { stringValue: detalle.tipoVehiculo },
    nombreUsuario: { stringValue: detalle.nombreUsuario },
    intentos: { integerValue: String(detalle.intentos) },
    detectadoEn: { timestampValue: new Date().toISOString() },
    revisada: { booleanValue: false }
  })
}

/**
 * Avisa que un boleto se detectó como recobro sospechoso (ver
 * RecobroSospechosoError en src/db/boletos.ts) por correo y/o Firestore —
 * cada canal se salta solo si no está configurado, no falla el otro.
 * Se llama fire-and-forget desde ipc.ts, nunca debe tumbar el cobro real.
 */
export async function avisarRecobroSospechoso(db: DB, estacionamientoId: number, error: RecobroSospechosoError): Promise<void> {
  const estacionamiento = obtenerEstacionamientoActual(db)
  const detalle = obtenerDetalleIntentoRecobro(db, error.boletoId, error.usuarioId)

  await Promise.allSettled([
    avisarPorCorreo(db, estacionamiento.nombre, estacionamientoId, detalle),
    avisarPorFirestore(db, estacionamientoId, detalle, error.boletoId)
  ])
}

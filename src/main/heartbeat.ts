import { ipcMain } from 'electron'
import { obtenerDb } from './db'
import { requerirAdmin } from './auth'
import type { DB } from '../db'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerResumen } from '../db/boletos'
import { listarCortes } from '../db/cortes'
import { obtenerConfiguracionMonitoreo, ConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { aplicarConfigSincronizable, construirConfigSincronizable, ConfigSincronizable } from '../db/configSincronizacion'
import { codificarValorFirestore, decodificarValorFirestore, obtenerDocumento, parchearDocumento } from './firestoreRest'

const INTERVALO_MS = 60_000

export interface DatosLatido {
  nombre: string
  actualmenteDentro: number
  entradasDesdeUltimoCorte: number
  ultimoCorteMonto: number | null
  ultimoCorteFecha: string | null
}

function calcularDatosLatido(db: DB, estacionamientoId: number): DatosLatido {
  const estacionamiento = obtenerEstacionamientoActual(db)
  const resumen = obtenerResumen(db, estacionamientoId)
  const ultimoCorte = listarCortes(db, estacionamientoId)[0]

  return {
    nombre: estacionamiento.nombre,
    actualmenteDentro: resumen.actualmenteDentro,
    entradasDesdeUltimoCorte: resumen.entradasDesdeUltimoCorte,
    ultimoCorteMonto: ultimoCorte?.totalMonto ?? null,
    ultimoCorteFecha: ultimoCorte?.hasta ?? null
  }
}

function rutaDocumentoEstacionamiento(config: ConfiguracionMonitoreo): string {
  return `estacionamientos/${config.slug}`
}

async function enviarLatido(config: ConfiguracionMonitoreo, datos: DatosLatido, configActual: ConfigSincronizable): Promise<void> {
  await parchearDocumento(config, rutaDocumentoEstacionamiento(config), {
    nombre: { stringValue: datos.nombre },
    actualmenteDentro: { integerValue: String(datos.actualmenteDentro) },
    entradasDesdeUltimoCorte: { integerValue: String(datos.entradasDesdeUltimoCorte) },
    actualizadoEn: { timestampValue: new Date().toISOString() },
    ultimoCorteMonto: datos.ultimoCorteMonto == null ? { nullValue: null } : { doubleValue: datos.ultimoCorteMonto },
    ultimoCorteFecha: datos.ultimoCorteFecha == null ? { nullValue: null } : { timestampValue: datos.ultimoCorteFecha },
    configActual: codificarValorFirestore(configActual)
  })
}

/**
 * Revisa si hay una configuración pendiente escrita por un panel remoto
 * (ver src/db/configSincronizacion.ts) y, si la hay, la aplica localmente y
 * la limpia — para que el panel sepa de inmediato que ya se aplicó, sin
 * esperar al siguiente latido.
 */
async function revisarConfigPendiente(config: ConfiguracionMonitoreo, db: DB, estacionamientoId: number): Promise<void> {
  const campos = await obtenerDocumento(config, rutaDocumentoEstacionamiento(config))
  if (!campos) return

  const pendienteRaw = campos.configPendiente
  if (!pendienteRaw || 'nullValue' in (pendienteRaw as Record<string, unknown>)) return

  const pendiente = decodificarValorFirestore(pendienteRaw) as ConfigSincronizable
  const { errores } = aplicarConfigSincronizable(db, estacionamientoId, pendiente)

  await parchearDocumento(config, rutaDocumentoEstacionamiento(config), {
    configPendiente: { nullValue: null },
    configAplicadaEn: { timestampValue: new Date().toISOString() },
    configErrores: codificarValorFirestore(errores),
    configActual: codificarValorFirestore(construirConfigSincronizable(db, estacionamientoId))
  })
}

/** Manda el latido ahora mismo si el monitoreo está habilitado para este estacionamiento. Silencioso si no. */
async function intentarLatido(): Promise<void> {
  const db = obtenerDb()
  const estacionamiento = obtenerEstacionamientoActual(db)
  const config = obtenerConfiguracionMonitoreo(db, estacionamiento.id)
  if (!config || !config.habilitado) return

  try {
    await enviarLatido(config, calcularDatosLatido(db, estacionamiento.id), construirConfigSincronizable(db, estacionamiento.id))
    await revisarConfigPendiente(config, db, estacionamiento.id)
  } catch (error) {
    // No tumbar la app por un problema de red/Firebase — solo se pierde este
    // latido, el siguiente lo vuelve a intentar.
    console.error('[monitoreo] falló el envío del latido:', error)
  }
}

export function iniciarLatidos(): void {
  intentarLatido()
  setInterval(intentarLatido, INTERVALO_MS)

  ipcMain.handle('monitoreo:probar', async (_evento, config: ConfiguracionMonitoreo) => {
    requerirAdmin()
    const db = obtenerDb()
    const estacionamiento = obtenerEstacionamientoActual(db)
    await enviarLatido(config, calcularDatosLatido(db, estacionamiento.id), construirConfigSincronizable(db, estacionamiento.id))
  })
}

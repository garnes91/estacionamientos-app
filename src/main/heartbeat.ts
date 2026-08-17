import { ipcMain } from 'electron'
import { obtenerDb } from './db'
import { requerirAdmin } from './auth'
import type { DB } from '../db'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerResumen } from '../db/boletos'
import { listarCortes } from '../db/cortes'
import { obtenerConfiguracionMonitoreo, ConfiguracionMonitoreo } from '../db/configuracionMonitoreo'

const INTERVALO_MS = 60_000

/**
 * Habla con Firebase por REST (Identity Toolkit para autenticación anónima +
 * Firestore) en vez de usar el SDK de Firebase: el SDK está pensado para
 * navegador o Node "puro", y Electron es un entorno intermedio con
 * incompatibilidades conocidas. REST + fetch (nativo desde Node 18) evita
 * el problema por completo y no agrega ninguna dependencia.
 */

interface TokenCache {
  idToken: string
  expiraEn: number
}

const cachePorApiKey = new Map<string, TokenCache>()

async function obtenerTokenAnonimo(apiKey: string): Promise<string> {
  const cacheado = cachePorApiKey.get(apiKey)
  if (cacheado && Date.now() < cacheado.expiraEn) return cacheado.idToken

  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  })
  if (!resp.ok) {
    throw new Error(`No se pudo autenticar con Firebase (${resp.status}): ${await resp.text()}`)
  }
  const datos = (await resp.json()) as { idToken: string; expiresIn: string }

  const token: TokenCache = { idToken: datos.idToken, expiraEn: Date.now() + Number(datos.expiresIn) * 1000 - 60_000 }
  cachePorApiKey.set(apiKey, token)
  return token.idToken
}

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

async function enviarLatido(config: ConfiguracionMonitoreo, datos: DatosLatido): Promise<void> {
  const token = await obtenerTokenAnonimo(config.apiKey)

  const campos: Record<string, unknown> = {
    nombre: { stringValue: datos.nombre },
    actualmenteDentro: { integerValue: String(datos.actualmenteDentro) },
    entradasDesdeUltimoCorte: { integerValue: String(datos.entradasDesdeUltimoCorte) },
    actualizadoEn: { timestampValue: new Date().toISOString() },
    ultimoCorteMonto: datos.ultimoCorteMonto == null ? { nullValue: null } : { doubleValue: datos.ultimoCorteMonto },
    ultimoCorteFecha: datos.ultimoCorteFecha == null ? { nullValue: null } : { timestampValue: datos.ultimoCorteFecha }
  }

  const campoNombres = Object.keys(campos)
    .map((campo) => `updateMask.fieldPaths=${campo}`)
    .join('&')
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/estacionamientos/${config.slug}?${campoNombres}`

  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: campos })
  })
  if (!resp.ok) {
    throw new Error(`Firestore respondió ${resp.status}: ${await resp.text()}`)
  }
}

/** Manda el latido ahora mismo si el monitoreo está habilitado para este estacionamiento. Silencioso si no. */
async function intentarLatido(): Promise<void> {
  const db = obtenerDb()
  const estacionamiento = obtenerEstacionamientoActual(db)
  const config = obtenerConfiguracionMonitoreo(db, estacionamiento.id)
  if (!config || !config.habilitado) return

  try {
    await enviarLatido(config, calcularDatosLatido(db, estacionamiento.id))
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
    await enviarLatido(config, calcularDatosLatido(db, estacionamiento.id))
  })
}

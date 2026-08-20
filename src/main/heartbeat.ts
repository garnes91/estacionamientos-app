import { ipcMain } from 'electron'
import { obtenerDb } from './db'
import { requerirAdmin } from './auth'
import type { DB } from '../db'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { obtenerResumen } from '../db/boletos'
import { listarCortes } from '../db/cortes'
import { obtenerConfiguracionMonitoreo, ConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { aplicarConfigSincronizable, construirConfigSincronizable, ConfigSincronizable } from '../db/configSincronizacion'

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

/**
 * Codifica/decodifica valores de JS al formato "typed value" que usa la API
 * REST de Firestore ({ stringValue: "x" }, { mapValue: { fields: {...} } },
 * etc. en vez de JSON plano) — necesario para poder mandar y leer de vuelta
 * la configuración completa (tipos de vehículo, tarifas, series...), no
 * solo los campos sueltos que ya mandaba el latido.
 */
function codificarValorFirestore(valor: unknown): Record<string, unknown> {
  if (valor === null || valor === undefined) return { nullValue: null }
  if (typeof valor === 'string') return { stringValue: valor }
  if (typeof valor === 'boolean') return { booleanValue: valor }
  if (typeof valor === 'number') {
    return Number.isInteger(valor) ? { integerValue: String(valor) } : { doubleValue: valor }
  }
  if (Array.isArray(valor)) {
    return { arrayValue: { values: valor.map(codificarValorFirestore) } }
  }
  if (typeof valor === 'object') {
    const fields: Record<string, unknown> = {}
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      fields[clave] = codificarValorFirestore(v)
    }
    return { mapValue: { fields } }
  }
  throw new Error(`No se puede codificar a Firestore un valor de tipo ${typeof valor}`)
}

function decodificarValorFirestore(valor: any): unknown {
  if (valor == null) return null
  if ('nullValue' in valor) return null
  if ('stringValue' in valor) return valor.stringValue
  if ('booleanValue' in valor) return valor.booleanValue
  if ('integerValue' in valor) return Number(valor.integerValue)
  if ('doubleValue' in valor) return valor.doubleValue
  if ('timestampValue' in valor) return valor.timestampValue
  if ('arrayValue' in valor) return ((valor.arrayValue.values ?? []) as unknown[]).map(decodificarValorFirestore)
  if ('mapValue' in valor) {
    const obj: Record<string, unknown> = {}
    for (const [clave, v] of Object.entries((valor.mapValue.fields ?? {}) as Record<string, unknown>)) {
      obj[clave] = decodificarValorFirestore(v)
    }
    return obj
  }
  return null
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

function urlDocumento(config: ConfiguracionMonitoreo): string {
  return `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/estacionamientos/${config.slug}`
}

async function parchearDocumento(config: ConfiguracionMonitoreo, campos: Record<string, unknown>): Promise<void> {
  const token = await obtenerTokenAnonimo(config.apiKey)
  const campoNombres = Object.keys(campos)
    .map((campo) => `updateMask.fieldPaths=${campo}`)
    .join('&')

  const resp = await fetch(`${urlDocumento(config)}?${campoNombres}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: campos })
  })
  if (!resp.ok) {
    throw new Error(`Firestore respondió ${resp.status}: ${await resp.text()}`)
  }
}

async function enviarLatido(config: ConfiguracionMonitoreo, datos: DatosLatido, configActual: ConfigSincronizable): Promise<void> {
  await parchearDocumento(config, {
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
  const token = await obtenerTokenAnonimo(config.apiKey)
  const resp = await fetch(urlDocumento(config), { headers: { Authorization: `Bearer ${token}` } })
  if (resp.status === 404) return
  if (!resp.ok) {
    throw new Error(`Firestore respondió ${resp.status}: ${await resp.text()}`)
  }

  const documento = (await resp.json()) as { fields?: Record<string, unknown> }
  const pendienteRaw = documento.fields?.configPendiente
  if (!pendienteRaw || 'nullValue' in (pendienteRaw as Record<string, unknown>)) return

  const pendiente = decodificarValorFirestore(pendienteRaw) as ConfigSincronizable
  aplicarConfigSincronizable(db, estacionamientoId, pendiente)

  await parchearDocumento(config, {
    configPendiente: { nullValue: null },
    configAplicadaEn: { timestampValue: new Date().toISOString() },
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

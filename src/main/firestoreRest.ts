/**
 * Habla con Firebase por REST (Identity Toolkit para autenticación anónima +
 * Firestore) en vez de usar el SDK de Firebase: el SDK está pensado para
 * navegador o Node "puro", y Electron es un entorno intermedio con
 * incompatibilidades conocidas. REST + fetch (nativo desde Node 18) evita
 * el problema por completo y no agrega ninguna dependencia.
 *
 * Compartido por cualquier feature que necesite leer/escribir Firestore
 * desde el proceso principal (heartbeat.ts, facturacionSync.ts).
 */

export interface CredencialesFirebase {
  apiKey: string
  projectId: string
}

interface TokenCache {
  idToken: string
  expiraEn: number
}

const cachePorApiKey = new Map<string, TokenCache>()

export async function obtenerTokenAnonimo(apiKey: string): Promise<string> {
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
 * etc. en vez de JSON plano).
 */
export function codificarValorFirestore(valor: unknown): Record<string, unknown> {
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

export function decodificarValorFirestore(valor: any): unknown {
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

function urlDocumento(config: CredencialesFirebase, rutaDocumento: string): string {
  return `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/${rutaDocumento}`
}

/** Lee un documento. `null` si no existe (404) — no lanza en ese caso. */
export async function obtenerDocumento(
  config: CredencialesFirebase,
  rutaDocumento: string
): Promise<Record<string, unknown> | null> {
  const token = await obtenerTokenAnonimo(config.apiKey)
  const resp = await fetch(urlDocumento(config, rutaDocumento), { headers: { Authorization: `Bearer ${token}` } })
  if (resp.status === 404) return null
  if (!resp.ok) {
    throw new Error(`Firestore respondió ${resp.status}: ${await resp.text()}`)
  }
  const documento = (await resp.json()) as { fields?: Record<string, unknown> }
  return documento.fields ?? {}
}

/** Actualiza (o crea) solo los campos dados — el resto del documento queda intacto. */
export async function parchearDocumento(
  config: CredencialesFirebase,
  rutaDocumento: string,
  campos: Record<string, unknown>
): Promise<void> {
  const token = await obtenerTokenAnonimo(config.apiKey)
  const campoNombres = Object.keys(campos)
    .map((campo) => `updateMask.fieldPaths=${campo}`)
    .join('&')

  const resp = await fetch(`${urlDocumento(config, rutaDocumento)}?${campoNombres}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: campos })
  })
  if (!resp.ok) {
    throw new Error(`Firestore respondió ${resp.status}: ${await resp.text()}`)
  }
}

/** Borra un documento. No lanza si ya no existía (404). */
export async function eliminarDocumento(config: CredencialesFirebase, rutaDocumento: string): Promise<void> {
  const token = await obtenerTokenAnonimo(config.apiKey)
  const resp = await fetch(urlDocumento(config, rutaDocumento), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Firestore respondió ${resp.status}: ${await resp.text()}`)
  }
}

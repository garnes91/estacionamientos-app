/**
 * Habla con Firebase Storage por REST (mismo criterio que firestoreRest.ts:
 * evitar el SDK de Firebase en Electron, usar fetch nativo + el token
 * anónimo que ya emite obtenerTokenAnonimo). Usado por respaldoNube.ts para
 * subir el respaldo diario de la base de datos.
 */

import { obtenerTokenAnonimo, CredencialesFirebase } from './firestoreRest'

/**
 * Firebase asigna este nombre de bucket por default a los proyectos nuevos
 * (los viejos usan `<projectId>.appspot.com`, pero este proyecto se activó
 * ya con el esquema nuevo).
 */
export function bucketPorDefecto(projectId: string): string {
  return `${projectId}.firebasestorage.app`
}

export interface ArchivoStorage {
  nombre: string
  tamanoBytes: number
  actualizadoEn: string
}

function urlObjeto(bucket: string, ruta: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(ruta)}`
}

/** Sube (o sobrescribe) un archivo. Subida simple — de sobra para el tamaño de un respaldo de esta app. */
export async function subirArchivo(
  config: CredencialesFirebase,
  bucket: string,
  ruta: string,
  contenido: Buffer
): Promise<void> {
  const token = await obtenerTokenAnonimo(config.apiKey)
  const resp = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(ruta)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` },
      body: new Uint8Array(contenido)
    }
  )
  if (!resp.ok) {
    throw new Error(`Firebase Storage respondió ${resp.status} al subir: ${await resp.text()}`)
  }
}

/** Lista los archivos bajo un prefijo (ej. "respaldos/centro/"). */
export async function listarArchivos(
  config: CredencialesFirebase,
  bucket: string,
  prefijo: string
): Promise<ArchivoStorage[]> {
  const token = await obtenerTokenAnonimo(config.apiKey)
  // delimiter=/ es lo que hace que esto sea un listado "de un solo nivel"
  // (como ls de una carpeta) — sin él, Storage lo trata como un listado
  // recursivo de todo lo que empiece con el prefijo, y las reglas de
  // "list" de storage.rules (ver ahí) no lo autorizan igual.
  const resp = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?prefix=${encodeURIComponent(prefijo)}&delimiter=%2F`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!resp.ok) {
    throw new Error(`Firebase Storage respondió ${resp.status} al listar: ${await resp.text()}`)
  }
  const datos = (await resp.json()) as { items?: { name: string; size: string; updated: string }[] }
  return (datos.items ?? []).map((item) => ({
    nombre: item.name,
    tamanoBytes: Number(item.size),
    actualizadoEn: item.updated
  }))
}

/** Borra un archivo. No lanza si ya no existía (404). */
export async function eliminarArchivo(config: CredencialesFirebase, bucket: string, ruta: string): Promise<void> {
  const token = await obtenerTokenAnonimo(config.apiKey)
  const resp = await fetch(urlObjeto(bucket, ruta), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Firebase Storage respondió ${resp.status} al borrar: ${await resp.text()}`)
  }
}

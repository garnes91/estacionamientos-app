import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firestore'
import { SUPER_ADMIN_UID } from './superAdmin'

interface CrearSocioInput {
  email: string
  password: string
  nombre: string
}

function validarInput(data: Partial<CrearSocioInput>): CrearSocioInput {
  if (!data.email || !data.password || !data.nombre) {
    throw new HttpsError('invalid-argument', 'Falta el correo, la contraseña o el nombre del socio')
  }
  if (data.password.length < 6) {
    throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres')
  }
  return data as CrearSocioInput
}

/**
 * Da de alta la cuenta de un socio (sub-admin) — solo la llama el super
 * admin desde la pestaña "Administración" de panel-operador/index.html. Usa
 * el Admin SDK para crear el usuario porque el SDK de cliente no puede: te
 * dejaría autenticado como el usuario nuevo en vez del super admin.
 */
export const crearSocio = onCall(async (request) => {
  if (request.auth?.uid !== SUPER_ADMIN_UID) {
    throw new HttpsError('permission-denied', 'Solo el super admin puede dar de alta socios')
  }

  const { email, password, nombre } = validarInput((request.data ?? {}) as Partial<CrearSocioInput>)

  let uid: string
  try {
    const usuario = await getAuth().createUser({ email, password, displayName: nombre })
    uid = usuario.uid
  } catch (error) {
    console.error('[socios] error al crear el usuario de Firebase Auth:', error)
    throw new HttpsError('already-exists', 'No se pudo crear la cuenta (¿ese correo ya está en uso?)')
  }

  await db.doc(`socios/${uid}`).set({ email, nombre, creadoEn: FieldValue.serverTimestamp() })

  return { uid }
})

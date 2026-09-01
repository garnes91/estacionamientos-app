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

interface EliminarSocioInput {
  uid: string
}

/**
 * Da de baja a un socio — típicamente porque se creó con un dato mal
 * capturado y hay que rehacerlo. Libera primero sus estacionamientos (vuelven
 * a "sin asignar", solo los ve el super admin) para que no queden apuntando
 * a un uid que ya no existe, y hasta el final borra la cuenta de Auth.
 */
export const eliminarSocio = onCall(async (request) => {
  if (request.auth?.uid !== SUPER_ADMIN_UID) {
    throw new HttpsError('permission-denied', 'Solo el super admin puede eliminar socios')
  }

  const { uid } = (request.data ?? {}) as Partial<EliminarSocioInput>
  if (!uid) {
    throw new HttpsError('invalid-argument', 'Falta el uid del socio')
  }
  if (uid === SUPER_ADMIN_UID) {
    throw new HttpsError('invalid-argument', 'No puedes eliminar la cuenta del super admin')
  }

  const asignadosSnap = await db.collection('estacionamientos').where('ownerUid', '==', uid).get()
  const lote = db.batch()
  for (const doc of asignadosSnap.docs) {
    lote.update(doc.ref, { ownerUid: null })
  }
  lote.delete(db.doc(`socios/${uid}`))
  await lote.commit()

  try {
    await getAuth().deleteUser(uid)
  } catch (error) {
    console.error(`[socios] error al eliminar el usuario de Firebase Auth ${uid}:`, error)
    throw new HttpsError(
      'internal',
      'Se liberaron sus estacionamientos, pero no se pudo borrar la cuenta de acceso — contacta soporte.'
    )
  }

  return { ok: true }
})

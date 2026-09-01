/**
 * UID del super admin (tú) — el mismo valor debe estar hardcodeado en
 * `firestore.rules` (dos veces) y en `panel-operador/index.html`. Se obtiene
 * creando a mano tu propio usuario en Firebase Console → Authentication →
 * Add user, y copiando el UID que te asigna.
 *
 * No hay forma de compartir esta constante entre Cloud Functions, las
 * reglas de Firestore (otro lenguaje) y el panel estático (otro deploy) —
 * si cambias este valor, cámbialo en los tres lugares.
 */
export const SUPER_ADMIN_UID = 'CWNhpqZAmZhfXrKxjtmrYWrTpbf2'

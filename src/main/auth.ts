import type { UsuarioBasico } from '../db/usuarios'

/** Sesión en memoria del proceso principal — se pierde al cerrar la app (esperado: login por turno/apertura). */
let usuarioActual: UsuarioBasico | null = null

export function establecerUsuarioActual(usuario: UsuarioBasico | null): void {
  usuarioActual = usuario
}

export function obtenerUsuarioActual(): UsuarioBasico | null {
  return usuarioActual
}

/** Para handlers IPC que necesitan un usuario real (emitir/cobrar): lanza si no hay sesión. */
export function requerirUsuarioActual(): UsuarioBasico {
  if (!usuarioActual) {
    throw new Error('No hay una sesión iniciada')
  }
  return usuarioActual
}

/** Para handlers de configuración: exige sesión de admin, no solo cualquier sesión. */
export function requerirAdmin(): UsuarioBasico {
  const usuario = requerirUsuarioActual()
  if (usuario.rol !== 'admin') {
    throw new Error('Esta acción requiere una sesión de administrador')
  }
  return usuario
}

/**
 * Para el puñado de acciones que un supervisor también puede hacer sin ser
 * admin (precios: tarifa progresiva y plana; series: proporción y
 * activar/desactivar). Todo lo demás de configuración sigue exigiendo
 * requerirAdmin() a propósito — en particular crear series/usuarios,
 * establecer el siguiente folio de una serie, y el umbral de recobro
 * sospechoso, porque son justo las palancas que permitirían a un
 * supervisor coludirse con un empleado para encubrir un fraude sin que se
 * note (ver ReautenticarCorte.tsx y la discusión que motivó este rol).
 */
export function requerirSupervisorOAdmin(): UsuarioBasico {
  const usuario = requerirUsuarioActual()
  if (usuario.rol !== 'admin' && usuario.rol !== 'supervisor') {
    throw new Error('Esta acción requiere una sesión de administrador o supervisor')
  }
  return usuario
}

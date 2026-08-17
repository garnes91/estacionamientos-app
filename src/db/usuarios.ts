import type { DB } from './index'
import { hashPassword, verifyPassword } from './passwordHash'

export type Rol = 'admin' | 'empleado'

export interface UsuarioBasico {
  id: number
  nombreCompleto: string
  rol: Rol
}

/**
 * Usuario a usar como emisor en contextos sin sesión (tests, scripts).
 * Toma el primero registrado para el estacionamiento (ver src/db/seed.ts).
 * El flujo real de la app usa autenticar() vía login, no esta función.
 */
export function obtenerUsuarioPorDefecto(db: DB, estacionamientoId: number): UsuarioBasico {
  const fila = db
    .prepare(
      'SELECT id, nombre_completo AS nombreCompleto, rol FROM usuarios WHERE estacionamiento_id = ? ORDER BY id LIMIT 1'
    )
    .get(estacionamientoId) as UsuarioBasico | undefined

  if (!fila) {
    throw new Error('No hay usuarios configurados en esta instalación')
  }

  return fila
}

interface UsuarioConHash extends UsuarioBasico {
  passwordHash: string
}

/** Verifica usuario/contraseña. Devuelve null (no lanza) si no coinciden, para no filtrar cuál de los dos falló. */
export function autenticar(
  db: DB,
  estacionamientoId: number,
  nombreUsuario: string,
  password: string
): UsuarioBasico | null {
  const fila = db
    .prepare(
      `SELECT id, nombre_completo AS nombreCompleto, rol, password_hash AS passwordHash
       FROM usuarios
       WHERE estacionamiento_id = ? AND nombre_usuario = ? AND activo = 1`
    )
    .get(estacionamientoId, nombreUsuario) as UsuarioConHash | undefined

  if (!fila || !verifyPassword(password, fila.passwordHash)) {
    return null
  }

  return { id: fila.id, nombreCompleto: fila.nombreCompleto, rol: fila.rol }
}

export interface UsuarioAdmin {
  id: number
  nombreUsuario: string
  nombreCompleto: string
  rol: Rol
  activo: boolean
}

interface UsuarioAdminRow {
  id: number
  nombreUsuario: string
  nombreCompleto: string
  rol: Rol
  activo: number
}

export function listarUsuarios(db: DB, estacionamientoId: number): UsuarioAdmin[] {
  const filas = db
    .prepare<[number], UsuarioAdminRow>(
      `SELECT id, nombre_usuario AS nombreUsuario, nombre_completo AS nombreCompleto, rol, activo
       FROM usuarios WHERE estacionamiento_id = ? ORDER BY id`
    )
    .all(estacionamientoId)

  return filas.map((f) => ({ ...f, activo: f.activo === 1 }))
}

function lanzarSiNombreDuplicado(error: unknown, nombreUsuario: string): never {
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    throw new Error(`Ya existe un usuario con el nombre "${nombreUsuario}"`)
  }
  throw error
}

export interface NuevoUsuarioInput {
  estacionamientoId: number
  nombreUsuario: string
  password: string
  nombreCompleto: string
  rol: Rol
}

export function crearUsuario(db: DB, input: NuevoUsuarioInput): UsuarioAdmin {
  try {
    const id = db
      .prepare(
        `INSERT INTO usuarios (estacionamiento_id, nombre_usuario, password_hash, nombre_completo, rol)
         VALUES (?,?,?,?,?)`
      )
      .run(input.estacionamientoId, input.nombreUsuario, hashPassword(input.password), input.nombreCompleto, input.rol)
      .lastInsertRowid as number

    return {
      id,
      nombreUsuario: input.nombreUsuario,
      nombreCompleto: input.nombreCompleto,
      rol: input.rol,
      activo: true
    }
  } catch (error) {
    lanzarSiNombreDuplicado(error, input.nombreUsuario)
  }
}

export interface ActualizarUsuarioInput {
  id: number
  nombreCompleto: string
  rol: Rol
  activo: boolean
}

export function actualizarUsuario(db: DB, input: ActualizarUsuarioInput): void {
  db.prepare('UPDATE usuarios SET nombre_completo = ?, rol = ?, activo = ? WHERE id = ?').run(
    input.nombreCompleto,
    input.rol,
    input.activo ? 1 : 0,
    input.id
  )
}

export function cambiarPassword(db: DB, id: number, password: string): void {
  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(hashPassword(password), id)
}

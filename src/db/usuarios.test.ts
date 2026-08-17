import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { actualizarUsuario, autenticar, cambiarPassword, crearUsuario, listarUsuarios } from './usuarios'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
})

describe('autenticar', () => {
  it('autentica al admin sembrado con sus credenciales por defecto', () => {
    const usuario = autenticar(db, estacionamientoId, 'admin', 'admin')
    expect(usuario).toMatchObject({ nombreCompleto: 'Administrador', rol: 'admin' })
  })

  it('autentica al empleado sembrado con sus credenciales por defecto', () => {
    const usuario = autenticar(db, estacionamientoId, 'empleado', 'empleado')
    expect(usuario).toMatchObject({ nombreCompleto: 'Empleado de prueba', rol: 'empleado' })
  })

  it('devuelve null con contraseña incorrecta', () => {
    expect(autenticar(db, estacionamientoId, 'admin', 'clave-incorrecta')).toBeNull()
  })

  it('devuelve null con usuario inexistente', () => {
    expect(autenticar(db, estacionamientoId, 'nadie', 'admin')).toBeNull()
  })

  it('devuelve null si el usuario está desactivado', () => {
    db.prepare('UPDATE usuarios SET activo = 0 WHERE nombre_usuario = ?').run('empleado')
    expect(autenticar(db, estacionamientoId, 'empleado', 'empleado')).toBeNull()
  })

  it('no mezcla usuarios entre estacionamientos distintos', () => {
    const otroEstId = db
      .prepare('INSERT INTO estacionamientos (nombre) VALUES (?)')
      .run('Otro estacionamiento').lastInsertRowid as number

    expect(autenticar(db, otroEstId, 'admin', 'admin')).toBeNull()
  })
})

describe('listarUsuarios', () => {
  it('lista los dos usuarios sembrados, sin exponer el password_hash', () => {
    const usuarios = listarUsuarios(db, estacionamientoId)
    expect(usuarios).toHaveLength(2)
    expect(usuarios.map((u) => u.nombreUsuario).sort()).toEqual(['admin', 'empleado'])
    expect(usuarios[0]).not.toHaveProperty('passwordHash')
  })
})

describe('crearUsuario', () => {
  it('el usuario creado puede autenticarse de inmediato', () => {
    crearUsuario(db, {
      estacionamientoId,
      nombreUsuario: 'juan',
      password: 'clave123',
      nombreCompleto: 'Juan Pérez',
      rol: 'empleado'
    })

    expect(autenticar(db, estacionamientoId, 'juan', 'clave123')).toMatchObject({ nombreCompleto: 'Juan Pérez' })
  })

  it('rechaza un nombre de usuario duplicado con un mensaje claro', () => {
    expect(() =>
      crearUsuario(db, {
        estacionamientoId,
        nombreUsuario: 'admin',
        password: 'otra',
        nombreCompleto: 'Otro Admin',
        rol: 'admin'
      })
    ).toThrow('Ya existe un usuario con el nombre "admin"')
  })
})

describe('actualizarUsuario', () => {
  it('cambia rol y desactiva; el usuario desactivado ya no autentica', () => {
    const empleado = listarUsuarios(db, estacionamientoId).find((u) => u.nombreUsuario === 'empleado')!
    actualizarUsuario(db, { id: empleado.id, nombreCompleto: empleado.nombreCompleto, rol: 'admin', activo: false })

    const actualizado = listarUsuarios(db, estacionamientoId).find((u) => u.id === empleado.id)!
    expect(actualizado.rol).toBe('admin')
    expect(actualizado.activo).toBe(false)
    expect(autenticar(db, estacionamientoId, 'empleado', 'empleado')).toBeNull()
  })
})

describe('cambiarPassword', () => {
  it('la contraseña vieja deja de funcionar y la nueva sí', () => {
    const empleado = listarUsuarios(db, estacionamientoId).find((u) => u.nombreUsuario === 'empleado')!
    cambiarPassword(db, empleado.id, 'nuevaClave')

    expect(autenticar(db, estacionamientoId, 'empleado', 'empleado')).toBeNull()
    expect(autenticar(db, estacionamientoId, 'empleado', 'nuevaClave')).not.toBeNull()
  })
})

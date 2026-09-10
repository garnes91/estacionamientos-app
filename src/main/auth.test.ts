import { afterEach, describe, expect, it } from 'vitest'
import {
  establecerUsuarioActual,
  obtenerUsuarioActual,
  requerirAdmin,
  requerirSupervisorOAdmin,
  requerirUsuarioActual
} from './auth'
import type { UsuarioBasico } from '../db/usuarios'

const ADMIN: UsuarioBasico = { id: 1, nombreCompleto: 'Ana Admin', rol: 'admin' }
const SUPERVISOR: UsuarioBasico = { id: 2, nombreCompleto: 'Sofía Supervisora', rol: 'supervisor' }
const EMPLEADO: UsuarioBasico = { id: 3, nombreCompleto: 'Beto Empleado', rol: 'empleado' }

afterEach(() => {
  establecerUsuarioActual(null)
})

describe('requerirUsuarioActual', () => {
  it('lanza si no hay sesión', () => {
    expect(() => requerirUsuarioActual()).toThrow('No hay una sesión iniciada')
  })

  it('devuelve el usuario si hay sesión, sin importar el rol', () => {
    establecerUsuarioActual(EMPLEADO)
    expect(requerirUsuarioActual()).toEqual(EMPLEADO)
  })
})

describe('requerirAdmin', () => {
  it('pasa con admin', () => {
    establecerUsuarioActual(ADMIN)
    expect(requerirAdmin()).toEqual(ADMIN)
  })

  it('rechaza a supervisor', () => {
    establecerUsuarioActual(SUPERVISOR)
    expect(() => requerirAdmin()).toThrow('sesión de administrador')
  })

  it('rechaza a empleado', () => {
    establecerUsuarioActual(EMPLEADO)
    expect(() => requerirAdmin()).toThrow('sesión de administrador')
  })

  it('rechaza sin sesión', () => {
    expect(() => requerirAdmin()).toThrow('No hay una sesión iniciada')
  })
})

describe('requerirSupervisorOAdmin', () => {
  it('pasa con admin', () => {
    establecerUsuarioActual(ADMIN)
    expect(requerirSupervisorOAdmin()).toEqual(ADMIN)
  })

  it('pasa con supervisor', () => {
    establecerUsuarioActual(SUPERVISOR)
    expect(requerirSupervisorOAdmin()).toEqual(SUPERVISOR)
  })

  it('rechaza a empleado', () => {
    establecerUsuarioActual(EMPLEADO)
    expect(() => requerirSupervisorOAdmin()).toThrow('administrador o supervisor')
  })

  it('rechaza sin sesión', () => {
    expect(() => requerirSupervisorOAdmin()).toThrow('No hay una sesión iniciada')
  })
})

describe('establecerUsuarioActual / obtenerUsuarioActual', () => {
  it('guarda y limpia la sesión en memoria', () => {
    expect(obtenerUsuarioActual()).toBeNull()
    establecerUsuarioActual(ADMIN)
    expect(obtenerUsuarioActual()).toEqual(ADMIN)
    establecerUsuarioActual(null)
    expect(obtenerUsuarioActual()).toBeNull()
  })
})

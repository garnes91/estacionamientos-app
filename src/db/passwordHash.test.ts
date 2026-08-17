import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './passwordHash'

describe('hashPassword / verifyPassword', () => {
  it('verifica correctamente la contraseña correcta', () => {
    const hash = hashPassword('miClave123')
    expect(verifyPassword('miClave123', hash)).toBe(true)
  })

  it('rechaza una contraseña incorrecta', () => {
    const hash = hashPassword('miClave123')
    expect(verifyPassword('otraClave', hash)).toBe(false)
  })

  it('nunca guarda la contraseña en texto plano', () => {
    const hash = hashPassword('miClave123')
    expect(hash).not.toContain('miClave123')
  })

  it('genera un salt distinto cada vez (dos hashes de la misma clave no son iguales)', () => {
    const hash1 = hashPassword('miClave123')
    const hash2 = hashPassword('miClave123')
    expect(hash1).not.toBe(hash2)
    expect(verifyPassword('miClave123', hash1)).toBe(true)
    expect(verifyPassword('miClave123', hash2)).toBe(true)
  })

  it('rechaza un valor almacenado con formato inválido en vez de lanzar error', () => {
    expect(verifyPassword('cualquier', 'texto-sin-formato')).toBe(false)
    expect(verifyPassword('cualquier', '')).toBe(false)
  })
})

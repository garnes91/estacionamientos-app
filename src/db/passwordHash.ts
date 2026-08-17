import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const KEYLEN = 64

/** Hashea una contraseña con scrypt (salt aleatorio embebido). Guardado como "salt:hash" en hex. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEYLEN).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, almacenado: string): boolean {
  const [salt, hashHex] = almacenado.split(':')
  if (!salt || !hashHex) return false

  const hashEsperado = Buffer.from(hashHex, 'hex')
  const hashIngresado = scryptSync(password, salt, KEYLEN)
  if (hashEsperado.length !== hashIngresado.length) return false

  return timingSafeEqual(hashEsperado, hashIngresado)
}

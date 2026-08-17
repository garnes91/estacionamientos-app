import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import type { UsuarioSesion } from './OperacionBoletos'

export function Login({ onLogin }: { onLogin: (usuario: UsuarioSesion) => void }): ReactElement {
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault()
    setCargando(true)
    setError(null)
    try {
      const usuario = await window.api.login({ nombreUsuario, password })
      onLogin(usuario)
    } catch {
      setError('Usuario o contraseña incorrectos')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 320 }}>
      <h1>Iniciar sesión</h1>
      <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input
          type="text"
          placeholder="Usuario"
          value={nombreUsuario}
          onChange={(e) => setNombreUsuario(e.target.value)}
          autoFocus
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />
        {error && <p style={{ color: 'crimson', margin: 0 }}>{error}</p>}
        <button type="submit" disabled={cargando || !nombreUsuario || !password} style={{ padding: '0.5rem' }}>
          Entrar
        </button>
      </form>
    </div>
  )
}

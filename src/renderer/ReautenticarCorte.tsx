import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'

/**
 * Reconfirma credenciales antes de entrar a una pantalla sensible, sin
 * tocar la sesión activa del operador (ver auth:verificar en
 * src/main/ipc.ts) — así nadie que se quedó con la ventana abierta puede
 * entrar sin volver a autenticarse. Con `soloAdmin`, además exige que esas
 * credenciales sean de una cuenta con rol admin (ej. Corte mensual) — no
 * basta con que sean válidas.
 */
export function ReautenticarCorte({
  onVerificado,
  onCancelar,
  soloAdmin = false,
  titulo = 'Confirmar identidad',
  mensaje = 'Vuelve a introducir tu usuario y contraseña para continuar.'
}: {
  onVerificado: () => void
  onCancelar: () => void
  soloAdmin?: boolean
  titulo?: string
  mensaje?: string
}): ReactElement {
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault()
    setCargando(true)
    setError(null)
    try {
      const usuario = await window.api.verificarCredenciales({ nombreUsuario, password })
      if (soloAdmin && usuario.rol !== 'admin') {
        setError('Se necesita una cuenta de administrador para entrar aquí')
        return
      }
      onVerificado()
    } catch {
      setError('Usuario o contraseña incorrectos')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 320 }}>
      <h1>{titulo}</h1>
      <p style={{ color: '#666' }}>{mensaje}</p>
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={cargando || !nombreUsuario || !password} style={{ padding: '0.5rem', flex: 1 }}>
            Continuar
          </button>
          <button type="button" onClick={onCancelar} style={{ padding: '0.5rem' }}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

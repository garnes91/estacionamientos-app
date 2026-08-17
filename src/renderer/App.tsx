import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Login } from './Login'
import { OperacionBoletos, UsuarioSesion } from './OperacionBoletos'
import { AdminConfig } from './AdminConfig'
import { BoletosAbiertos } from './BoletosAbiertos'
import { CorteCaja } from './CorteCaja'
import { ReautenticarCorte } from './ReautenticarCorte'

type Pantalla = 'operacion' | 'admin' | 'boletosAbiertos' | 'corte'

function App(): ReactElement {
  const [usuario, setUsuario] = useState<UsuarioSesion | null | undefined>(undefined)
  const [pantalla, setPantalla] = useState<Pantalla>('operacion')
  const [corteAutorizado, setCorteAutorizado] = useState(false)

  useEffect(() => {
    window.api
      .usuarioActual()
      .then(setUsuario)
      .catch(() => setUsuario(null))
  }, [])

  function cerrarSesion(): void {
    setUsuario(null)
    setPantalla('operacion')
    setCorteAutorizado(false)
  }

  function volverDeCorte(): void {
    setPantalla('operacion')
    setCorteAutorizado(false)
  }

  if (usuario === undefined) {
    return <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>Cargando…</div>
  }

  if (usuario === null) {
    return <Login onLogin={setUsuario} />
  }

  if (pantalla === 'admin' && usuario.rol === 'admin') {
    return <AdminConfig usuario={usuario} onVolver={() => setPantalla('operacion')} onCerrarSesion={cerrarSesion} />
  }

  if (pantalla === 'boletosAbiertos') {
    return <BoletosAbiertos onVolver={() => setPantalla('operacion')} />
  }

  if (pantalla === 'corte') {
    if (!corteAutorizado) {
      return <ReautenticarCorte onVerificado={() => setCorteAutorizado(true)} onCancelar={() => setPantalla('operacion')} />
    }
    return <CorteCaja nombreUsuario={usuario.nombreCompleto} onVolver={volverDeCorte} />
  }

  return (
    <OperacionBoletos
      usuario={usuario}
      onCerrarSesion={cerrarSesion}
      onAbrirConfiguracion={usuario.rol === 'admin' ? () => setPantalla('admin') : undefined}
      onVerBoletosAbiertos={() => setPantalla('boletosAbiertos')}
      onVerCorte={() => setPantalla('corte')}
    />
  )
}

export default App

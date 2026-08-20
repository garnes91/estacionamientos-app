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
  const [actualizacionLista, setActualizacionLista] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .usuarioActual()
      .then(setUsuario)
      .catch(() => setUsuario(null))
  }, [])

  // La instalación en sí sigue siendo automática (al cerrar la app) — esto
  // solo avisa que ya está descargada, para que no parezca que no pasó nada.
  useEffect(() => {
    window.api.actualizaciones.estado().then(setActualizacionLista)
    return window.api.actualizaciones.alEstarLista(setActualizacionLista)
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

  let contenido: ReactElement

  if (usuario === undefined) {
    contenido = <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>Cargando…</div>
  } else if (usuario === null) {
    contenido = <Login onLogin={setUsuario} />
  } else if (pantalla === 'admin' && usuario.rol === 'admin') {
    contenido = <AdminConfig usuario={usuario} onVolver={() => setPantalla('operacion')} onCerrarSesion={cerrarSesion} />
  } else if (pantalla === 'boletosAbiertos') {
    contenido = <BoletosAbiertos onVolver={() => setPantalla('operacion')} />
  } else if (pantalla === 'corte') {
    contenido = !corteAutorizado ? (
      <ReautenticarCorte onVerificado={() => setCorteAutorizado(true)} onCancelar={() => setPantalla('operacion')} />
    ) : (
      <CorteCaja nombreUsuario={usuario.nombreCompleto} onVolver={volverDeCorte} />
    )
  } else {
    contenido = (
      <OperacionBoletos
        usuario={usuario}
        onCerrarSesion={cerrarSesion}
        onAbrirConfiguracion={usuario.rol === 'admin' ? () => setPantalla('admin') : undefined}
        onVerBoletosAbiertos={() => setPantalla('boletosAbiertos')}
        onVerCorte={() => setPantalla('corte')}
      />
    )
  }

  return (
    <>
      {contenido}
      {actualizacionLista && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#eef4ff',
            color: '#1a3d7c',
            padding: '0.5rem 1rem',
            textAlign: 'center',
            fontSize: '0.85rem',
            borderTop: '1px solid #c8d9f5'
          }}
        >
          Actualización {actualizacionLista} lista — se instalará sola la próxima vez que cierres la app.
        </div>
      )}
    </>
  )
}

export default App

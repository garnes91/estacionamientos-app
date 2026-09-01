import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Login } from './Login'
import { OperacionBoletos, UsuarioSesion } from './OperacionBoletos'
import { AdminConfig } from './AdminConfig'
import { BoletosAbiertos } from './BoletosAbiertos'
import { CorteCaja } from './CorteCaja'
import { ReautenticarCorte } from './ReautenticarCorte'
import { Pensionados } from './Pensionados'
import { Gastos } from './Gastos'
import { CorteMensual } from './CorteMensual'

type Pantalla = 'operacion' | 'admin' | 'boletosAbiertos' | 'corte' | 'pensionados' | 'gastos' | 'corteMensual'

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

  // La descarga es automática en segundo plano; instalar no — el operador
  // decide cuándo, con un clic, y ahí corre el instalador normal de
  // Windows (visible), no uno silencioso que resultó poco confiable.
  useEffect(() => {
    window.api.actualizaciones.estado().then(setActualizacionLista)
    return window.api.actualizaciones.alEstarLista(setActualizacionLista)
  }, [])

  function instalarActualizacion(): void {
    window.api.actualizaciones.instalar()
  }

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
  } else if (pantalla === 'pensionados') {
    contenido = <Pensionados onVolver={() => setPantalla('operacion')} />
  } else if (pantalla === 'gastos') {
    contenido = <Gastos onVolver={() => setPantalla('operacion')} />
  } else if (pantalla === 'corteMensual') {
    contenido = <CorteMensual onVolver={() => setPantalla('operacion')} />
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
        onVerPensionados={() => setPantalla('pensionados')}
        onVerGastos={() => setPantalla('gastos')}
        onVerCorteMensual={() => setPantalla('corteMensual')}
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
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            borderTop: '1px solid #c8d9f5'
          }}
        >
          <span>Actualización {actualizacionLista} lista.</span>
          <button onClick={instalarActualizacion} style={{ padding: '0.25rem 0.75rem' }}>
            Actualizar ahora
          </button>
          <span style={{ opacity: 0.75 }}>
            Si Windows muestra un aviso durante la instalación, dale clic en "Cancelar" (no "Reintentar").
          </span>
        </div>
      )}
    </>
  )
}

export default App

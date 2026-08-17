import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { BLOQUES_CONFIGURABLES } from '../logic/motorTarifas'
import type { UsuarioSesion } from './OperacionBoletos'

const TABS = ['tipos', 'tarifas', 'planas', 'series', 'texto', 'usuarios', 'correo', 'monitoreo', 'impresion'] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = {
  tipos: 'Tipos de vehículo',
  tarifas: 'Tarifas',
  planas: 'Tarifa plana',
  series: 'Series de folio',
  texto: 'Estacionamiento',
  usuarios: 'Usuarios',
  correo: 'Correo',
  monitoreo: 'Monitoreo en la nube',
  impresion: 'Impresoras'
}

const inputStyle: React.CSSProperties = { padding: '0.35rem', fontSize: '0.9rem' }
const thStyle: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.4rem' }
const tdStyle: React.CSSProperties = { padding: '0.4rem', borderBottom: '1px solid #eee' }

export function AdminConfig({
  usuario,
  onVolver,
  onCerrarSesion
}: {
  usuario: UsuarioSesion
  onVolver: () => void
  onCerrarSesion: () => void
}): ReactElement {
  const [estacionamientoId, setEstacionamientoId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('tipos')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.estacionamientoActual().then((e) => setEstacionamientoId(e.id))
  }, [])

  function avisar(texto: string): void {
    setMensaje(texto)
    setError(null)
    setTimeout(() => setMensaje(null), 3000)
  }

  function avisarError(e: unknown): void {
    setError(String(e))
    setMensaje(null)
  }

  async function cerrarSesion(): Promise<void> {
    await window.api.logout()
    onCerrarSesion()
  }

  if (!estacionamientoId) {
    return <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>Cargando…</div>
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 780 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 style={{ margin: 0 }}>Configuración</h1>
        <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#666' }}>
          <div>
            {usuario.nombreCompleto} · {usuario.rol}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', justifyContent: 'flex-end' }}>
            <button onClick={onVolver}>Volver a operación</button>
            <button onClick={cerrarSesion}>Cerrar sesión</button>
          </div>
        </div>
      </div>

      <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ fontWeight: tab === t ? 'bold' : 'normal', padding: '0.4rem 0.75rem' }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      {mensaje && <p style={{ background: '#eefbea', padding: '0.5rem 0.75rem', borderRadius: 4 }}>{mensaje}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {tab === 'tipos' && (
        <TabTiposVehiculo estacionamientoId={estacionamientoId} avisar={avisar} avisarError={avisarError} />
      )}
      {tab === 'tarifas' && (
        <TabTarifas estacionamientoId={estacionamientoId} avisar={avisar} avisarError={avisarError} />
      )}
      {tab === 'planas' && (
        <TabTarifasPlanas estacionamientoId={estacionamientoId} avisar={avisar} avisarError={avisarError} />
      )}
      {tab === 'series' && <TabSeries estacionamientoId={estacionamientoId} avisar={avisar} avisarError={avisarError} />}
      {tab === 'texto' && (
        <TabTextoBoleto estacionamientoId={estacionamientoId} avisar={avisar} avisarError={avisarError} />
      )}
      {tab === 'usuarios' && (
        <TabUsuarios estacionamientoId={estacionamientoId} avisar={avisar} avisarError={avisarError} />
      )}
      {tab === 'correo' && (
        <TabCorreo estacionamientoId={estacionamientoId} avisar={avisar} avisarError={avisarError} />
      )}
      {tab === 'monitoreo' && (
        <TabMonitoreo estacionamientoId={estacionamientoId} avisar={avisar} avisarError={avisarError} />
      )}
      {tab === 'impresion' && (
        <TabImpresion estacionamientoId={estacionamientoId} avisar={avisar} avisarError={avisarError} />
      )}
    </div>
  )
}

interface TabProps {
  estacionamientoId: number
  avisar: (texto: string) => void
  avisarError: (e: unknown) => void
}

// ============================================================
// Tipos de vehículo
// ============================================================
interface TipoVehiculoAdmin {
  id: number
  nombre: string
  orden: number
  activo: boolean
}

function TabTiposVehiculo({ estacionamientoId, avisar, avisarError }: TabProps): ReactElement {
  const [tipos, setTipos] = useState<TipoVehiculoAdmin[]>([])
  const [nombreNuevo, setNombreNuevo] = useState('')

  async function cargar(): Promise<void> {
    setTipos(await window.api.admin.tiposVehiculo.listar(estacionamientoId))
  }

  useEffect(() => {
    cargar().catch(avisarError)
  }, [estacionamientoId])

  async function guardar(t: TipoVehiculoAdmin): Promise<void> {
    try {
      await window.api.admin.tiposVehiculo.actualizar({ id: t.id, nombre: t.nombre, activo: t.activo })
      await cargar()
      avisar(`"${t.nombre}" guardado`)
    } catch (e) {
      avisarError(e)
    }
  }

  async function mover(index: number, direccion: -1 | 1): Promise<void> {
    const destino = index + direccion
    if (destino < 0 || destino >= tipos.length) return
    const copia = [...tipos]
    ;[copia[index], copia[destino]] = [copia[destino], copia[index]]
    try {
      await window.api.admin.tiposVehiculo.reordenar({ estacionamientoId, ordenIds: copia.map((t) => t.id) })
      await cargar()
    } catch (e) {
      avisarError(e)
    }
  }

  async function agregar(): Promise<void> {
    if (!nombreNuevo.trim()) return
    try {
      await window.api.admin.tiposVehiculo.crear({ estacionamientoId, nombre: nombreNuevo.trim() })
      setNombreNuevo('')
      await cargar()
      avisar('Tipo de vehículo creado. Configúrale una tarifa en la pestaña "Tarifas" antes de usarlo.')
    } catch (e) {
      avisarError(e)
    }
  }

  async function eliminar(t: TipoVehiculoAdmin): Promise<void> {
    const confirmado = window.confirm(
      `¿Eliminar "${t.nombre}"? Si ya tiene tarifas o boletos asociados no se podrá eliminar — desactívalo en su lugar.`
    )
    if (!confirmado) return
    try {
      await window.api.admin.tiposVehiculo.eliminar(t.id)
      await cargar()
      avisar(`"${t.nombre}" eliminado`)
    } catch (e) {
      avisarError(e)
    }
  }

  return (
    <div>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        El orden determina el mapeo F1/F2/F3 en la pantalla de emisión.
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={thStyle}>Orden</th>
            <th style={thStyle}>Nombre</th>
            <th style={thStyle}>Activo</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {tipos.map((t, i) => (
            <tr key={t.id}>
              <td style={tdStyle}>
                <button disabled={i === 0} onClick={() => mover(i, -1)}>
                  ↑
                </button>
                <button disabled={i === tipos.length - 1} onClick={() => mover(i, 1)}>
                  ↓
                </button>
              </td>
              <td style={tdStyle}>
                <input
                  style={inputStyle}
                  value={t.nombre}
                  onChange={(e) =>
                    setTipos((prev) => prev.map((x) => (x.id === t.id ? { ...x, nombre: e.target.value } : x)))
                  }
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  checked={t.activo}
                  onChange={(e) =>
                    setTipos((prev) => prev.map((x) => (x.id === t.id ? { ...x, activo: e.target.checked } : x)))
                  }
                />
              </td>
              <td style={tdStyle}>
                <button onClick={() => guardar(t)}>Guardar</button>{' '}
                <button onClick={() => eliminar(t)}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <input
          style={inputStyle}
          placeholder="Nombre del tipo nuevo, ej. Motocicleta"
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
        />
        <button onClick={agregar} disabled={!nombreNuevo.trim()}>
          Agregar tipo de vehículo
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Tarifas progresivas
// ============================================================
function TabTarifas({ estacionamientoId, avisar, avisarError }: TabProps): ReactElement {
  const [tipos, setTipos] = useState<TipoVehiculoAdmin[]>([])
  const [tipoId, setTipoId] = useState<number | null>(null)
  const [tarifaMaximaDiaria, setTarifaMaximaDiaria] = useState(0)
  const [precios, setPrecios] = useState<number[]>(Array(BLOQUES_CONFIGURABLES).fill(0))

  useEffect(() => {
    window.api.admin.tiposVehiculo.listar(estacionamientoId).then((t) => {
      setTipos(t)
      setTipoId((actual) => actual ?? t[0]?.id ?? null)
    })
  }, [estacionamientoId])

  useEffect(() => {
    if (!tipoId) return
    window.api.admin.tarifas.obtenerActivaPorTipo(tipoId).then((tarifa) => {
      if (tarifa) {
        setTarifaMaximaDiaria(tarifa.tarifaMaximaDiaria)
        setPrecios(tarifa.preciosPorBloque)
      } else {
        setTarifaMaximaDiaria(0)
        setPrecios(Array(BLOQUES_CONFIGURABLES).fill(0))
      }
    })
  }, [tipoId])

  async function guardar(): Promise<void> {
    if (!tipoId) return
    try {
      await window.api.admin.tarifas.actualizar({ estacionamientoId, tipoVehiculoId: tipoId, tarifaMaximaDiaria, preciosPorBloque: precios })
      avisar('Tarifa guardada. Los boletos ya abiertos siguen cobrando con la tarifa anterior.')
    } catch (e) {
      avisarError(e)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <label>
          Tipo de vehículo:{' '}
          <select value={tipoId ?? ''} onChange={(e) => setTipoId(Number(e.target.value))}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>
          Tope máximo por ciclo de 24h (0 = sin tope):{' '}
          <input
            style={inputStyle}
            type="number"
            min={0}
            value={tarifaMaximaDiaria}
            onChange={(e) => setTarifaMaximaDiaria(Number(e.target.value))}
          />
        </label>
      </div>

      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Precio incremental por bloque de 15 min (1 a {BLOQUES_CONFIGURABLES}). Después del último bloque se repite su
        precio.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
        {precios.map((precio, i) => (
          <label key={i} style={{ fontSize: '0.75rem', color: '#666' }}>
            B{i + 1}
            <input
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              type="number"
              min={0}
              step="0.01"
              value={precio}
              onChange={(e) => {
                const nuevo = [...precios]
                nuevo[i] = Number(e.target.value)
                setPrecios(nuevo)
              }}
            />
          </label>
        ))}
      </div>

      <button onClick={guardar} disabled={!tipoId} style={{ marginTop: '1rem' }}>
        Guardar tarifa
      </button>
    </div>
  )
}

// ============================================================
// Tarifa plana
// ============================================================
interface TarifaPlanaAdmin {
  id: number
  tipoVehiculoId: number
  nombre: string
  precioFijo: number
  horasIncluidas: number
  activo: boolean
}

function TabTarifasPlanas({ estacionamientoId, avisar, avisarError }: TabProps): ReactElement {
  const [tipos, setTipos] = useState<TipoVehiculoAdmin[]>([])
  const [planas, setPlanas] = useState<TarifaPlanaAdmin[]>([])
  const [nueva, setNueva] = useState({ tipoVehiculoId: 0, nombre: '', precioFijo: 0, horasIncluidas: 1 })

  async function cargar(): Promise<void> {
    const [t, p] = await Promise.all([
      window.api.admin.tiposVehiculo.listar(estacionamientoId),
      window.api.admin.tarifasPlanas.listar(estacionamientoId)
    ])
    setTipos(t)
    setPlanas(p)
    setNueva((prev) => ({ ...prev, tipoVehiculoId: prev.tipoVehiculoId || t[0]?.id || 0 }))
  }

  useEffect(() => {
    cargar().catch(avisarError)
  }, [estacionamientoId])

  function nombreTipo(id: number): string {
    return tipos.find((t) => t.id === id)?.nombre ?? `#${id}`
  }

  async function guardarNombreActivo(p: TarifaPlanaAdmin): Promise<void> {
    try {
      await window.api.admin.tarifasPlanas.actualizar({ id: p.id, nombre: p.nombre, activo: p.activo })
      await cargar()
      avisar(`"${p.nombre}" guardado`)
    } catch (e) {
      avisarError(e)
    }
  }

  async function guardarPrecio(p: TarifaPlanaAdmin): Promise<void> {
    try {
      await window.api.admin.tarifasPlanas.cambiarPrecio({
        id: p.id,
        estacionamientoId,
        tipoVehiculoId: p.tipoVehiculoId,
        nombre: p.nombre,
        precioFijo: p.precioFijo,
        horasIncluidas: p.horasIncluidas
      })
      await cargar()
      avisar('Precio actualizado (versión nueva; los boletos abiertos con el precio viejo no cambian).')
    } catch (e) {
      avisarError(e)
    }
  }

  async function crear(): Promise<void> {
    if (!nueva.nombre.trim() || !nueva.tipoVehiculoId) return
    try {
      await window.api.admin.tarifasPlanas.crear({ estacionamientoId, ...nueva })
      setNueva({ tipoVehiculoId: tipos[0]?.id ?? 0, nombre: '', precioFijo: 0, horasIncluidas: 1 })
      await cargar()
      avisar('Tarifa plana creada')
    } catch (e) {
      avisarError(e)
    }
  }

  return (
    <div>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Se ofrecen al emitir el boleto (no al cobrar). Cambiar nombre/activo se guarda en el mismo registro; cambiar
        precio u horas crea una versión nueva para no afectar boletos ya abiertos.
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={thStyle}>Tipo</th>
            <th style={thStyle}>Nombre</th>
            <th style={thStyle}>Precio fijo</th>
            <th style={thStyle}>Horas incluidas</th>
            <th style={thStyle}>Activo</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {planas.map((p) => (
            <tr key={p.id}>
              <td style={tdStyle}>{nombreTipo(p.tipoVehiculoId)}</td>
              <td style={tdStyle}>
                <input
                  style={inputStyle}
                  value={p.nombre}
                  onChange={(e) => setPlanas((prev) => prev.map((x) => (x.id === p.id ? { ...x, nombre: e.target.value } : x)))}
                />
              </td>
              <td style={tdStyle}>
                <input
                  style={{ ...inputStyle, width: 80 }}
                  type="number"
                  min={0}
                  step="0.01"
                  value={p.precioFijo}
                  onChange={(e) =>
                    setPlanas((prev) => prev.map((x) => (x.id === p.id ? { ...x, precioFijo: Number(e.target.value) } : x)))
                  }
                />
              </td>
              <td style={tdStyle}>
                <input
                  style={{ ...inputStyle, width: 70 }}
                  type="number"
                  min={0}
                  step="0.5"
                  value={p.horasIncluidas}
                  onChange={(e) =>
                    setPlanas((prev) =>
                      prev.map((x) => (x.id === p.id ? { ...x, horasIncluidas: Number(e.target.value) } : x))
                    )
                  }
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  checked={p.activo}
                  onChange={(e) =>
                    setPlanas((prev) => prev.map((x) => (x.id === p.id ? { ...x, activo: e.target.checked } : x)))
                  }
                />
              </td>
              <td style={tdStyle}>
                <button onClick={() => guardarNombreActivo(p)}>Guardar</button>{' '}
                <button onClick={() => guardarPrecio(p)}>Guardar precio</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={nueva.tipoVehiculoId}
          onChange={(e) => setNueva({ ...nueva, tipoVehiculoId: Number(e.target.value) })}
        >
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <input
          style={inputStyle}
          placeholder="Nombre, ej. Plana 8h"
          value={nueva.nombre}
          onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
        />
        <input
          style={{ ...inputStyle, width: 80 }}
          type="number"
          placeholder="Precio"
          value={nueva.precioFijo}
          onChange={(e) => setNueva({ ...nueva, precioFijo: Number(e.target.value) })}
        />
        <input
          style={{ ...inputStyle, width: 70 }}
          type="number"
          step="0.5"
          placeholder="Horas"
          value={nueva.horasIncluidas}
          onChange={(e) => setNueva({ ...nueva, horasIncluidas: Number(e.target.value) })}
        />
        <button onClick={crear} disabled={!nueva.nombre.trim()}>
          Agregar tarifa plana
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Series de folio
// ============================================================
interface SerieFolioAdmin {
  id: number
  serie: string
  proporcion: number
  siguienteNumero: number
  contadorEmitidos: number
  activo: boolean
}

function TabSeries({ estacionamientoId, avisar, avisarError }: TabProps): ReactElement {
  const [series, setSeries] = useState<SerieFolioAdmin[]>([])
  const [nueva, setNueva] = useState({ serie: '', proporcion: 1 })
  const [proximoFolio, setProximoFolio] = useState<Record<number, string>>({})

  async function cargar(): Promise<void> {
    const datos = await window.api.admin.series.listar(estacionamientoId)
    setSeries(datos)
    setProximoFolio(Object.fromEntries(datos.map((s) => [s.id, String(s.siguienteNumero)])))
  }

  useEffect(() => {
    cargar().catch(avisarError)
  }, [estacionamientoId])

  async function guardar(s: SerieFolioAdmin): Promise<void> {
    try {
      await window.api.admin.series.actualizar({ id: s.id, proporcion: s.proporcion, activo: s.activo })
      await cargar()
      avisar(`Serie "${s.serie}" guardada`)
    } catch (e) {
      avisarError(e)
    }
  }

  async function crear(): Promise<void> {
    if (!nueva.serie.trim()) return
    try {
      await window.api.admin.series.crear({ estacionamientoId, serie: nueva.serie.trim(), proporcion: nueva.proporcion })
      setNueva({ serie: '', proporcion: 1 })
      await cargar()
      avisar('Serie creada')
    } catch (e) {
      avisarError(e)
    }
  }

  async function reestablecerFolio(s: SerieFolioAdmin): Promise<void> {
    const nuevoNumero = Number(proximoFolio[s.id])
    if (!Number.isInteger(nuevoNumero) || nuevoNumero < 1) {
      avisarError(new Error('El próximo folio debe ser un número entero mayor o igual a 1'))
      return
    }
    const confirmado = window.confirm(
      `¿Reestablecer el próximo folio de la serie "${s.serie}" a ${nuevoNumero}? El siguiente boleto de esta serie se emitirá con ese número.`
    )
    if (!confirmado) return
    try {
      await window.api.admin.series.establecerSiguienteNumero({ id: s.id, siguienteNumero: nuevoNumero })
      await cargar()
      avisar(`Próximo folio de "${s.serie}" reestablecido a ${nuevoNumero}`)
    } catch (e) {
      avisarError(e)
    }
  }

  async function eliminar(s: SerieFolioAdmin): Promise<void> {
    const confirmado = window.confirm(
      `¿Eliminar la serie "${s.serie}"? Los boletos ya emitidos con esa letra no se ven afectados, pero dejará de estar disponible para folios nuevos.`
    )
    if (!confirmado) return
    try {
      await window.api.admin.series.eliminar(s.id)
      await cargar()
      avisar(`Serie "${s.serie}" eliminada`)
    } catch (e) {
      avisarError(e)
    }
  }

  return (
    <div>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        La proporción define el reparto entre series (ej. A=3, B=1 reparte 3:1). Los folios ya emitidos no cambian.
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={thStyle}>Serie</th>
            <th style={thStyle}>Proporción</th>
            <th style={thStyle}>Emitidos</th>
            <th style={thStyle}>Activa</th>
            <th style={thStyle}></th>
            <th style={thStyle}>Próximo folio</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.id}>
              <td style={tdStyle}>{s.serie}</td>
              <td style={tdStyle}>
                <input
                  style={{ ...inputStyle, width: 60 }}
                  type="number"
                  min={1}
                  value={s.proporcion}
                  onChange={(e) =>
                    setSeries((prev) => prev.map((x) => (x.id === s.id ? { ...x, proporcion: Number(e.target.value) } : x)))
                  }
                />
              </td>
              <td style={tdStyle}>{s.contadorEmitidos}</td>
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  checked={s.activo}
                  onChange={(e) =>
                    setSeries((prev) => prev.map((x) => (x.id === s.id ? { ...x, activo: e.target.checked } : x)))
                  }
                />
              </td>
              <td style={tdStyle}>
                <button onClick={() => guardar(s)}>Guardar</button>{' '}
                <button onClick={() => eliminar(s)}>Eliminar</button>
              </td>
              <td style={tdStyle}>
                <input
                  style={{ ...inputStyle, width: 80 }}
                  type="number"
                  min={1}
                  value={proximoFolio[s.id] ?? ''}
                  onChange={(e) => setProximoFolio((prev) => ({ ...prev, [s.id]: e.target.value }))}
                />
              </td>
              <td style={tdStyle}>
                <button onClick={() => reestablecerFolio(s)}>Reestablecer</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: '#666', fontSize: '0.8rem' }}>
        "Próximo folio" es el número que tendrá el siguiente boleto emitido de esa serie — úsalo para empatar la
        numeración con un sistema o folio físico anterior. No se puede bajar por debajo de un folio ya usado en esta
        serie.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <input
          style={{ ...inputStyle, width: 60 }}
          placeholder="Letra"
          maxLength={3}
          value={nueva.serie}
          onChange={(e) => setNueva({ ...nueva, serie: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
        />
        <input
          style={{ ...inputStyle, width: 70 }}
          type="number"
          min={1}
          value={nueva.proporcion}
          onChange={(e) => setNueva({ ...nueva, proporcion: Number(e.target.value) })}
        />
        <button onClick={crear} disabled={!nueva.serie.trim()}>
          Agregar serie
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Texto del boleto
// ============================================================
function TabTextoBoleto({ estacionamientoId, avisar, avisarError }: TabProps): ReactElement {
  const [nombre, setNombre] = useState('')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    window.api.estacionamientoActual().then((e) => {
      setNombre(e.nombre)
      setTexto(e.textoBoleto ?? '')
    })
  }, [estacionamientoId])

  async function guardarNombre(): Promise<void> {
    try {
      await window.api.admin.estacionamiento.actualizarNombre({ estacionamientoId, nombre })
      avisar('Nombre del estacionamiento guardado')
    } catch (e) {
      avisarError(e)
    }
  }

  async function guardarTexto(): Promise<void> {
    try {
      await window.api.admin.estacionamiento.actualizarTextoBoleto({ estacionamientoId, texto: texto.trim() || null })
      avisar('Texto del boleto guardado')
    } catch (e) {
      avisarError(e)
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Nombre del estacionamiento</h3>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Aparece en la pantalla de operación, el boleto impreso, y el corte de caja (pantalla, PDF, Excel y correo).
        Con varias instalaciones, es lo que distingue de cuál estacionamiento es cada reporte.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', maxWidth: 480 }}>
        <input style={{ ...inputStyle, flex: 1 }} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <button onClick={guardarNombre} disabled={!nombre.trim()}>
          Guardar
        </button>
      </div>

      <h3>Texto del boleto</h3>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Se imprime tal cual (respetando saltos de línea) en cada boleto de este estacionamiento: datos de
        facturación, dirección fiscal, avisos, etc.
      </p>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={8}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', padding: '0.5rem' }}
      />
      <button onClick={guardarTexto} style={{ marginTop: '0.5rem' }}>
        Guardar
      </button>
    </div>
  )
}

// ============================================================
// Usuarios
// ============================================================
interface UsuarioAdmin {
  id: number
  nombreUsuario: string
  nombreCompleto: string
  rol: 'admin' | 'empleado'
  activo: boolean
}

function TabUsuarios({ estacionamientoId, avisar, avisarError }: TabProps): ReactElement {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [passwords, setPasswords] = useState<Record<number, string>>({})
  const [nuevo, setNuevo] = useState<{
    nombreUsuario: string
    password: string
    nombreCompleto: string
    rol: 'admin' | 'empleado'
  }>({ nombreUsuario: '', password: '', nombreCompleto: '', rol: 'empleado' })

  async function cargar(): Promise<void> {
    setUsuarios(await window.api.admin.usuarios.listar(estacionamientoId))
  }

  useEffect(() => {
    cargar().catch(avisarError)
  }, [estacionamientoId])

  async function guardar(u: UsuarioAdmin): Promise<void> {
    try {
      await window.api.admin.usuarios.actualizar({ id: u.id, nombreCompleto: u.nombreCompleto, rol: u.rol, activo: u.activo })
      await cargar()
      avisar(`"${u.nombreUsuario}" guardado`)
    } catch (e) {
      avisarError(e)
    }
  }

  async function cambiarPassword(id: number): Promise<void> {
    const password = passwords[id]
    if (!password) return
    try {
      await window.api.admin.usuarios.cambiarPassword({ id, password })
      setPasswords((prev) => ({ ...prev, [id]: '' }))
      avisar('Contraseña actualizada')
    } catch (e) {
      avisarError(e)
    }
  }

  async function crear(): Promise<void> {
    if (!nuevo.nombreUsuario.trim() || !nuevo.password.trim() || !nuevo.nombreCompleto.trim()) return
    try {
      await window.api.admin.usuarios.crear({ estacionamientoId, ...nuevo })
      setNuevo({ nombreUsuario: '', password: '', nombreCompleto: '', rol: 'empleado' })
      await cargar()
      avisar('Usuario creado')
    } catch (e) {
      avisarError(e)
    }
  }

  return (
    <div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={thStyle}>Usuario</th>
            <th style={thStyle}>Nombre completo</th>
            <th style={thStyle}>Rol</th>
            <th style={thStyle}>Activo</th>
            <th style={thStyle}></th>
            <th style={thStyle}>Nueva contraseña</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td style={tdStyle}>{u.nombreUsuario}</td>
              <td style={tdStyle}>
                <input
                  style={inputStyle}
                  value={u.nombreCompleto}
                  onChange={(e) =>
                    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, nombreCompleto: e.target.value } : x)))
                  }
                />
              </td>
              <td style={tdStyle}>
                <select
                  value={u.rol}
                  onChange={(e) =>
                    setUsuarios((prev) =>
                      prev.map((x) => (x.id === u.id ? { ...x, rol: e.target.value as 'admin' | 'empleado' } : x))
                    )
                  }
                >
                  <option value="empleado">empleado</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  checked={u.activo}
                  onChange={(e) =>
                    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, activo: e.target.checked } : x)))
                  }
                />
              </td>
              <td style={tdStyle}>
                <button onClick={() => guardar(u)}>Guardar</button>
              </td>
              <td style={tdStyle}>
                <input
                  style={inputStyle}
                  type="password"
                  placeholder="••••••"
                  value={passwords[u.id] ?? ''}
                  onChange={(e) => setPasswords((prev) => ({ ...prev, [u.id]: e.target.value }))}
                />
                <button onClick={() => cambiarPassword(u.id)} disabled={!passwords[u.id]}>
                  Cambiar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <input
          style={inputStyle}
          placeholder="Usuario"
          value={nuevo.nombreUsuario}
          onChange={(e) => setNuevo({ ...nuevo, nombreUsuario: e.target.value })}
        />
        <input
          style={inputStyle}
          type="password"
          placeholder="Contraseña"
          value={nuevo.password}
          onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
        />
        <input
          style={inputStyle}
          placeholder="Nombre completo"
          value={nuevo.nombreCompleto}
          onChange={(e) => setNuevo({ ...nuevo, nombreCompleto: e.target.value })}
        />
        <select
          value={nuevo.rol}
          onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value as 'admin' | 'empleado' })}
        >
          <option value="empleado">empleado</option>
          <option value="admin">admin</option>
        </select>
        <button onClick={crear}>Agregar usuario</button>
      </div>
    </div>
  )
}

// ============================================================
// Correo (SMTP para enviar el corte de caja)
// ============================================================
interface ConfiguracionCorreo {
  host: string
  puerto: number
  seguro: boolean
  usuario: string
  password: string
  remitente: string
  destinatarios: string
}

const CORREO_VACIO: ConfiguracionCorreo = {
  host: '',
  puerto: 587,
  seguro: false,
  usuario: '',
  password: '',
  remitente: '',
  destinatarios: ''
}

function TabCorreo({ estacionamientoId, avisar, avisarError }: TabProps): ReactElement {
  const [config, setConfig] = useState<ConfiguracionCorreo>(CORREO_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [probando, setProbando] = useState(false)

  useEffect(() => {
    window.api.admin.correo.obtener(estacionamientoId).then((c) => {
      if (c) setConfig(c)
    })
  }, [estacionamientoId])

  async function guardar(): Promise<void> {
    setGuardando(true)
    try {
      await window.api.admin.correo.guardar({ estacionamientoId, config })
      avisar('Configuración de correo guardada')
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  async function probar(): Promise<void> {
    setProbando(true)
    try {
      await window.api.admin.correo.probarConexion(config)
      avisar('Conexión exitosa — las credenciales funcionan')
    } catch (e) {
      avisarError(e)
    } finally {
      setProbando(false)
    }
  }

  return (
    <div>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Credenciales SMTP para enviar el corte de caja por correo (PDF + Excel). Funciona con Gmail (usando una{' '}
        <em>contraseña de aplicación</em>, no tu contraseña normal), Outlook, o cualquier proveedor SMTP. Se guardan
        tal cual en la base de datos local de esta instalación.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '0.5rem', alignItems: 'center', maxWidth: 480 }}>
        <label>Host</label>
        <input
          style={inputStyle}
          placeholder="smtp.gmail.com"
          value={config.host}
          onChange={(e) => setConfig({ ...config, host: e.target.value })}
        />

        <label>Puerto</label>
        <input
          style={inputStyle}
          type="number"
          value={config.puerto}
          onChange={(e) => setConfig({ ...config, puerto: Number(e.target.value) })}
        />

        <label>Conexión segura (TLS)</label>
        <input
          type="checkbox"
          checked={config.seguro}
          onChange={(e) => setConfig({ ...config, seguro: e.target.checked })}
        />

        <label>Usuario</label>
        <input
          style={inputStyle}
          placeholder="tu-correo@gmail.com"
          value={config.usuario}
          onChange={(e) => setConfig({ ...config, usuario: e.target.value })}
        />

        <label>Contraseña</label>
        <input
          style={inputStyle}
          type="password"
          placeholder="••••••••"
          value={config.password}
          onChange={(e) => setConfig({ ...config, password: e.target.value })}
        />

        <label>Remitente</label>
        <input
          style={inputStyle}
          placeholder="Mi Estacionamiento <tu-correo@gmail.com>"
          value={config.remitente}
          onChange={(e) => setConfig({ ...config, remitente: e.target.value })}
        />

        <label>Destinatarios</label>
        <input
          style={inputStyle}
          placeholder="dueno@ejemplo.com, contador@ejemplo.com"
          value={config.destinatarios}
          onChange={(e) => setConfig({ ...config, destinatarios: e.target.value })}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button onClick={guardar} disabled={guardando}>
          Guardar
        </button>
        <button onClick={probar} disabled={probando || !config.host || !config.usuario}>
          Probar conexión
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Monitoreo en la nube (latido periódico a Firebase, para el dashboard)
// ============================================================
interface ConfiguracionMonitoreo {
  habilitado: boolean
  apiKey: string
  projectId: string
  slug: string
}

const MONITOREO_VACIO: ConfiguracionMonitoreo = { habilitado: false, apiKey: '', projectId: '', slug: '' }

function TabMonitoreo({ estacionamientoId, avisar, avisarError }: TabProps): ReactElement {
  const [config, setConfig] = useState<ConfiguracionMonitoreo>(MONITOREO_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [probando, setProbando] = useState(false)

  useEffect(() => {
    window.api.admin.monitoreo.obtener(estacionamientoId).then((c) => {
      if (c) setConfig(c)
    })
  }, [estacionamientoId])

  async function guardar(): Promise<void> {
    setGuardando(true)
    try {
      await window.api.admin.monitoreo.guardar({ estacionamientoId, config })
      avisar('Configuración de monitoreo guardada')
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  async function probar(): Promise<void> {
    setProbando(true)
    try {
      await window.api.admin.monitoreo.probar(config)
      avisar('Latido enviado — revisa la colección "estacionamientos" en Firestore o el dashboard')
    } catch (e) {
      avisarError(e)
    } finally {
      setProbando(false)
    }
  }

  return (
    <div>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Manda cada minuto un resumen (ocupación actual, entradas desde el último corte, último corte) a un proyecto
        de Firebase propio, para poder ver el estado de todos tus estacionamientos en tiempo real desde el
        dashboard (ver <code>dashboard/index.html</code>). Necesitas un proyecto de Firebase con Firestore y
        autenticación anónima habilitados.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.5rem', alignItems: 'center', maxWidth: 480 }}>
        <label>Habilitado</label>
        <input
          type="checkbox"
          checked={config.habilitado}
          onChange={(e) => setConfig({ ...config, habilitado: e.target.checked })}
        />

        <label>API key de Firebase</label>
        <input
          style={inputStyle}
          placeholder="AIzaSy..."
          value={config.apiKey}
          onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
        />

        <label>ID de proyecto</label>
        <input
          style={inputStyle}
          placeholder="mi-proyecto-firebase"
          value={config.projectId}
          onChange={(e) => setConfig({ ...config, projectId: e.target.value })}
        />

        <label>Identificador de este estacionamiento</label>
        <input
          style={inputStyle}
          placeholder="centro"
          value={config.slug}
          onChange={(e) => setConfig({ ...config, slug: e.target.value })}
        />
      </div>
      <p style={{ color: '#999', fontSize: '0.8rem', maxWidth: 480 }}>
        El identificador debe ser único entre todas tus instalaciones (minúsculas, números y guiones, ej.
        "centro", "sucursal-norte") — es lo que distingue a este estacionamiento dentro del proyecto compartido.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button onClick={guardar} disabled={guardando}>
          Guardar
        </button>
        <button onClick={probar} disabled={probando || !config.apiKey || !config.projectId || !config.slug}>
          Probar (manda un latido ahora)
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Impresoras — fijar una por tipo para no confirmar el diálogo de Windows
// en cada boleto/reporte
// ============================================================
interface ConfiguracionImpresion {
  impresoraTicket: string | null
  impresoraReporte: string | null
}

const IMPRESION_VACIA: ConfiguracionImpresion = { impresoraTicket: null, impresoraReporte: null }

function TabImpresion({ estacionamientoId, avisar, avisarError }: TabProps): ReactElement {
  const [config, setConfig] = useState<ConfiguracionImpresion>(IMPRESION_VACIA)
  const [impresoras, setImpresoras] = useState<{ nombre: string; nombreVisible: string }[]>([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    window.api.admin.impresion.obtener(estacionamientoId).then((c) => {
      if (c) setConfig(c)
    })
    window.api.admin.impresion.listarImpresoras().then(setImpresoras).catch(avisarError)
  }, [estacionamientoId])

  async function guardar(): Promise<void> {
    setGuardando(true)
    try {
      await window.api.admin.impresion.guardar({ estacionamientoId, config })
      avisar('Configuración de impresión guardada')
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  function Selector({
    valor,
    onCambiar
  }: {
    valor: string | null
    onCambiar: (v: string | null) => void
  }): ReactElement {
    return (
      <select style={inputStyle} value={valor ?? ''} onChange={(e) => onCambiar(e.target.value || null)}>
        <option value="">(preguntar cada vez)</option>
        {impresoras.map((i) => (
          <option key={i.nombre} value={i.nombre}>
            {i.nombreVisible || i.nombre}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Si dejas una en "(preguntar cada vez)", se muestra el diálogo normal de impresión de Windows para elegir a
        mano. Si fijas una impresora, se imprime directo ahí sin preguntar — útil para la térmica de tickets, que se
        usa muchas veces por turno.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.5rem', alignItems: 'center', maxWidth: 480 }}>
        <label>Impresora de tickets</label>
        <Selector
          valor={config.impresoraTicket}
          onCambiar={(v) => setConfig({ ...config, impresoraTicket: v })}
        />

        <label>Impresora de reportes (corte)</label>
        <Selector
          valor={config.impresoraReporte}
          onCambiar={(v) => setConfig({ ...config, impresoraReporte: v })}
        />
      </div>

      {impresoras.length === 0 && (
        <p style={{ color: '#999', fontSize: '0.8rem', maxWidth: 480 }}>
          No se detectaron impresoras instaladas en esta computadora.
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button onClick={guardar} disabled={guardando}>
          Guardar
        </button>
      </div>
    </div>
  )
}

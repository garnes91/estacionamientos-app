import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { ConfirmModal } from './ConfirmModal'

const inputStyle: React.CSSProperties = { padding: '0.35rem', fontSize: '0.9rem' }

interface Gasto {
  id: number
  concepto: string
  categoria: 'operativo' | 'nomina' | 'servicios' | 'otro'
  monto: number
  formaPago: 'efectivo' | 'transferencia' | 'otro'
  fecha: string
}

const CATEGORIAS: { valor: Gasto['categoria']; etiqueta: string }[] = [
  { valor: 'operativo', etiqueta: 'Operativo (chico, del día a día)' },
  { valor: 'nomina', etiqueta: 'Nómina' },
  { valor: 'servicios', etiqueta: 'Servicios (luz, agua, internet)' },
  { valor: 'otro', etiqueta: 'Otro' }
]

const FORMAS_PAGO: { valor: Gasto['formaPago']; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo (sale de la caja)' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'otro', etiqueta: 'Otro' }
]

function fechaLocalISO(fecha: Date): string {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function hoyLocal(): string {
  return fechaLocalISO(new Date())
}

/**
 * `<input type="date">` solo da "YYYY-MM-DD" — convertirlo con
 * `new Date(texto).toISOString()` lo interpreta como medianoche UTC, que en
 * México cae varias horas ANTES de la medianoche local. Un gasto de "hoy"
 * terminaba fechado como de ayer (en UTC) y quedaba fuera del rango exacto
 * que usa el corte del día. Si la fecha elegida es hoy, se usa la hora
 * exacta actual (igual que boletos/pensionados); si es un día anterior
 * (captura tardía), se usa el mediodía LOCAL de ese día — cae del lado
 * correcto sin importar el huso horario, y nunca queda en el futuro.
 */
function convertirFechaSeleccionada(fechaTexto: string): string {
  if (fechaTexto === hoyLocal()) return new Date().toISOString()
  const [anio, mes, dia] = fechaTexto.split('-').map(Number)
  return new Date(anio, mes - 1, dia, 12, 0, 0).toISOString()
}

export function Gastos({ onVolver }: { onVolver: () => void }): ReactElement {
  const [estacionamientoId, setEstacionamientoId] = useState<number | null>(null)
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({
    concepto: '',
    categoria: 'operativo' as Gasto['categoria'],
    monto: 0,
    formaPago: 'efectivo' as Gasto['formaPago'],
    fecha: hoyLocal()
  })
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [confirmandoEliminarId, setConfirmandoEliminarId] = useState<number | null>(null)

  async function cargar(estId: number): Promise<void> {
    setGastos(await window.api.gastos.listar({ estacionamientoId: estId }))
  }

  useEffect(() => {
    window.api.estacionamientoActual().then((e) => {
      setEstacionamientoId(e.id)
      cargar(e.id).catch((err) => setError(String(err)))
    })
  }, [])

  function avisar(texto: string): void {
    setMensaje(texto)
    setError(null)
    setTimeout(() => setMensaje(null), 3000)
  }

  async function registrar(): Promise<void> {
    if (!estacionamientoId) return
    setGuardando(true)
    setError(null)
    try {
      await window.api.gastos.registrar({
        estacionamientoId,
        concepto: form.concepto,
        categoria: form.categoria,
        monto: form.monto,
        formaPago: form.formaPago,
        fecha: convertirFechaSeleccionada(form.fecha)
      })
      await cargar(estacionamientoId)
      setMostrarForm(false)
      setForm({ concepto: '', categoria: 'operativo', monto: 0, formaPago: 'efectivo', fecha: hoyLocal() })
      avisar('Gasto registrado')
    } catch (e) {
      setError(String(e))
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(id: number): Promise<void> {
    setEliminandoId(id)
    setError(null)
    try {
      await window.api.gastos.eliminar(id)
      if (estacionamientoId) await cargar(estacionamientoId)
      setConfirmandoEliminarId(null)
      avisar('Gasto eliminado')
    } catch (e) {
      setError(String(e))
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Gastos</h1>
        <button onClick={onVolver}>Volver</button>
      </div>

      {mensaje && <p style={{ background: '#eefbea', padding: '0.5rem 0.75rem', borderRadius: 4 }}>{mensaje}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ margin: '1rem 0' }}>
        {!mostrarForm ? (
          <button onClick={() => setMostrarForm(true)}>+ Nuevo gasto</button>
        ) : (
          <div style={{ border: '1px solid #e2e0da', borderRadius: 8, padding: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0.5rem', alignItems: 'center', maxWidth: 420 }}>
              <label>Concepto</label>
              <input
                style={inputStyle}
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                placeholder="Ej. Papelería, sueldo Juan, CFE"
              />
              <label>Categoría</label>
              <select
                style={inputStyle}
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as Gasto['categoria'] })}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
              <label>Monto</label>
              <input
                style={inputStyle}
                type="number"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })}
              />
              <label>Forma de pago</label>
              <select
                style={inputStyle}
                value={form.formaPago}
                onChange={(e) => setForm({ ...form, formaPago: e.target.value as Gasto['formaPago'] })}
              >
                {FORMAS_PAGO.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.etiqueta}
                  </option>
                ))}
              </select>
              <label>Fecha</label>
              <input
                style={inputStyle}
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>
            <p style={{ color: '#999', fontSize: '0.8rem', maxWidth: 420 }}>
              Solo los gastos en efectivo se restan del total en caja de los cortes — los demás quedan registrados
              para control, pero se pagaron aparte.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button onClick={registrar} disabled={guardando || !form.concepto.trim() || form.monto <= 0}>
                Registrar
              </button>
              <button onClick={() => setMostrarForm(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Categoría</th>
            <th>Forma de pago</th>
            <th>Monto</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {gastos.map((g) => (
            <tr key={g.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{new Date(g.fecha).toLocaleDateString('es-MX')}</td>
              <td>{g.concepto}</td>
              <td>{CATEGORIAS.find((c) => c.valor === g.categoria)?.etiqueta ?? g.categoria}</td>
              <td>{FORMAS_PAGO.find((f) => f.valor === g.formaPago)?.etiqueta ?? g.formaPago}</td>
              <td>${g.monto.toFixed(2)}</td>
              <td>
                <button onClick={() => setConfirmandoEliminarId(g.id)} disabled={eliminandoId === g.id}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {gastos.length === 0 && <p style={{ color: '#666' }}>No hay gastos registrados.</p>}

      {confirmandoEliminarId !== null && (
        <ConfirmModal
          mensaje={`¿Eliminar el gasto "${gastos.find((g) => g.id === confirmandoEliminarId)?.concepto}"?`}
          onSi={() => eliminar(confirmandoEliminarId)}
          onNo={() => setConfirmandoEliminarId(null)}
        />
      )}
    </div>
  )
}

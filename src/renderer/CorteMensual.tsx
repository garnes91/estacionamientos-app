import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'

interface EventoPensionado {
  id: number
  nombre: string
  fecha: string
}

interface PagoPensionado {
  id: number
  pensionadoNombre: string
  monto: number
  periodoDesde: string
  periodoHasta: string
  fechaPago: string
}

interface ResumenGastosPorCategoria {
  categoria: string
  cantidad: number
  monto: number
}

interface Corte {
  id: number
  hasta: string
  totalBoletos: number
  totalMonto: number
}

interface CorteMensualDatos {
  anio: number
  mes: number
  desde: string
  hasta: string
  totalBoletos: number
  totalMonto: number
  pensionadosPagosCantidad: number
  pensionadosPagosMonto: number
  pagosPensionados: PagoPensionado[]
  altasPensionados: EventoPensionado[]
  bajasPensionados: EventoPensionado[]
  gastosEfectivoCantidad: number
  gastosEfectivoMonto: number
  gastosPorCategoria: ResumenGastosPorCategoria[]
  totalEnCaja: number
  cortesDelMes: Corte[]
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString()
}

export function CorteMensual({ onVolver }: { onVolver: () => void }): ReactElement {
  const [estacionamientoId, setEstacionamientoId] = useState<number | null>(null)
  const [nombreEstacionamiento, setNombreEstacionamiento] = useState('')
  const ahora = new Date()
  const [anio, setAnio] = useState(ahora.getFullYear())
  const [mes, setMes] = useState(ahora.getMonth() + 1)
  const [datos, setDatos] = useState<CorteMensualDatos | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.estacionamientoActual().then((e) => {
      setEstacionamientoId(e.id)
      setNombreEstacionamiento(e.nombre)
    })
  }, [])

  async function ver(): Promise<void> {
    if (!estacionamientoId) return
    setCargando(true)
    setError(null)
    try {
      setDatos(await window.api.cortes.mensual({ estacionamientoId, anio, mes }))
    } catch (e) {
      setError(String(e))
    } finally {
      setCargando(false)
    }
  }

  async function imprimir(): Promise<void> {
    const elemento = document.getElementById('corte-mensual-imprimible')
    if (!elemento) return
    try {
      await window.api.imprimir({ html: elemento.outerHTML, tipo: 'reporte' })
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Corte mensual</h1>
        <button onClick={onVolver}>Volver</button>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '1rem 0' }}>
        <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ padding: '0.35rem' }}>
          {MESES.map((nombre, i) => (
            <option key={i} value={i + 1}>
              {nombre}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          style={{ padding: '0.35rem', width: 90 }}
        />
        <button onClick={ver} disabled={cargando}>
          Ver
        </button>
        {datos && <button onClick={imprimir}>Imprimir</button>}
      </div>

      {datos && (
        <div id="corte-mensual-imprimible">
          <h2 style={{ marginBottom: 0 }}>{nombreEstacionamiento}</h2>
          <p style={{ color: '#666', margin: '0.25rem 0' }}>
            Corte mensual — {MESES[datos.mes - 1]} {datos.anio}
          </p>

          <p style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
            Boletos: {datos.totalBoletos} — ${datos.totalMonto.toFixed(2)}
          </p>

          {(datos.altasPensionados.length > 0 || datos.bajasPensionados.length > 0 || datos.pagosPensionados.length > 0) && (
            <>
              <h3>Pensionados</h3>
              {datos.altasPensionados.length > 0 && (
                <p>
                  Altas ({datos.altasPensionados.length}): {datos.altasPensionados.map((a) => a.nombre).join(', ')}
                </p>
              )}
              {datos.bajasPensionados.length > 0 && (
                <p>
                  Bajas ({datos.bajasPensionados.length}): {datos.bajasPensionados.map((b) => b.nombre).join(', ')}
                </p>
              )}
              <p>
                Pagos: {datos.pensionadosPagosCantidad} — ${datos.pensionadosPagosMonto.toFixed(2)}
              </p>
            </>
          )}

          {datos.gastosPorCategoria.length > 0 && (
            <>
              <h3>Gastos por categoría</h3>
              <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                    <th>Categoría</th>
                    <th>Cantidad</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.gastosPorCategoria.map((g) => (
                    <tr key={g.categoria} style={{ borderBottom: '1px solid #eee' }}>
                      <td>{g.categoria}</td>
                      <td>{g.cantidad}</td>
                      <td>${g.monto.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: '#666', fontSize: '0.8rem' }}>
                De estos, solo {datos.gastosEfectivoCantidad} en efectivo (${datos.gastosEfectivoMonto.toFixed(2)}) se
                restan del total en caja — los demás se pagaron aparte.
              </p>
            </>
          )}

          <p style={{ fontWeight: 'bold', fontSize: '1.3rem', borderTop: '2px solid #333', paddingTop: '0.5rem' }}>
            Total en caja del mes: ${datos.totalEnCaja.toFixed(2)}
          </p>

          {datos.cortesDelMes.length > 0 && (
            <>
              <h3>Cortes de turno de este mes (referencia)</h3>
              <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                    <th>Hasta</th>
                    <th>Boletos</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.cortesDelMes.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td>{formatearFecha(c.hasta)}</td>
                      <td>{c.totalBoletos}</td>
                      <td>${c.totalMonto.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}

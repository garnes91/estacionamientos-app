import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { formatearFolio } from '../logic/folioBarcode'

interface BoletoListado {
  id: number
  serie: string
  folio: number
  tipoVehiculo: string
  placa: string | null
  horaEntrada: string
  estado: string
}

export function BoletosAbiertos({ onVolver }: { onVolver: () => void }): ReactElement {
  const [estacionamientoId, setEstacionamientoId] = useState<number | null>(null)
  const [boletos, setBoletos] = useState<BoletoListado[]>([])
  const [cobrandoId, setCobrandoId] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargar(estId: number): Promise<void> {
    setBoletos(await window.api.listarBoletosAbiertos(estId))
  }

  useEffect(() => {
    window.api.estacionamientoActual().then((e) => {
      setEstacionamientoId(e.id)
      cargar(e.id).catch((err) => setError(String(err)))
    })
  }, [])

  async function cobrar(boletoId: number, folioTexto: string): Promise<void> {
    if (!estacionamientoId) return
    setCobrandoId(boletoId)
    setError(null)
    try {
      const cierre = await window.api.cerrarBoleto({ estacionamientoId, boletoId })
      setMensaje(`${folioTexto} cobrado: $${cierre.monto.toFixed(2)}`)
      await cargar(estacionamientoId)
    } catch (e) {
      setError(String(e))
    } finally {
      setCobrandoId(null)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Boletos abiertos</h1>
        <button onClick={onVolver}>Volver</button>
      </div>

      {mensaje && <p style={{ background: '#eefbea', padding: '0.5rem 0.75rem', borderRadius: 4 }}>{mensaje}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>Folio</th>
            <th>Vehículo</th>
            <th>Placa</th>
            <th>Entrada</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {boletos.map((b) => {
            const folioTexto = formatearFolio(b.serie, b.folio)
            return (
              <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
                <td>{folioTexto}</td>
                <td>{b.tipoVehiculo}</td>
                <td>{b.placa ?? '—'}</td>
                <td>{new Date(b.horaEntrada).toLocaleString()}</td>
                <td>
                  <button onClick={() => cobrar(b.id, folioTexto)} disabled={cobrandoId === b.id}>
                    Cobrar
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {boletos.length === 0 && <p style={{ color: '#666' }}>No hay boletos abiertos.</p>}
    </div>
  )
}

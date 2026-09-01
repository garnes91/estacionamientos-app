import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { formatearFolio } from '../logic/folioBarcode'
import { ReciboCobro, DatosReciboCobro } from './ReciboCobro'
import { ConfirmModal } from './ConfirmModal'

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
  const [nombreEstacionamiento, setNombreEstacionamiento] = useState('')
  const [textoBoleto, setTextoBoleto] = useState<string | null>(null)
  const [cargoBoletoPerdido, setCargoBoletoPerdido] = useState(0)
  const [claveFolio, setClaveFolio] = useState('')
  const [boletos, setBoletos] = useState<BoletoListado[]>([])
  const [cobrandoId, setCobrandoId] = useState<number | null>(null)
  const [ultimoCobro, setUltimoCobro] = useState<DatosReciboCobro | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preguntandoImprimirRecibo, setPreguntandoImprimirRecibo] = useState(false)
  const [boletoPerdidoId, setBoletoPerdidoId] = useState<number | null>(null)
  const justoCobradoRef = useRef(false)

  async function cargar(estId: number): Promise<void> {
    setBoletos(await window.api.listarBoletosAbiertos(estId))
  }

  useEffect(() => {
    window.api.estacionamientoActual().then((e) => {
      setEstacionamientoId(e.id)
      setNombreEstacionamiento(e.nombre)
      setTextoBoleto(e.textoBoleto)
      setCargoBoletoPerdido(e.cargoBoletoPerdido)
      setClaveFolio(e.claveFolio)
      cargar(e.id).catch((err) => setError(String(err)))
    })
  }, [])

  async function imprimirRecibo(): Promise<void> {
    const elemento = document.getElementById('recibo-cobro')
    if (!elemento) return
    try {
      await window.api.imprimir({ html: elemento.outerHTML, tipo: 'ticket' })
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    if (!ultimoCobro || !justoCobradoRef.current) return
    justoCobradoRef.current = false
    setPreguntandoImprimirRecibo(true)
  }, [ultimoCobro])

  async function cerrar(boletoId: number, perdido: boolean): Promise<void> {
    if (!estacionamientoId) return
    setCobrandoId(boletoId)
    setError(null)
    try {
      const cierre = perdido
        ? await window.api.cerrarBoletoPerdido({ estacionamientoId, boletoId })
        : await window.api.cerrarBoleto({ estacionamientoId, boletoId })
      justoCobradoRef.current = true
      setUltimoCobro({
        estacionamientoNombre: nombreEstacionamiento,
        textoBoleto,
        serie: cierre.serie,
        folio: cierre.folio,
        tipoCobro: cierre.tipoCobro,
        minutosTotales: cierre.minutosTotales,
        monto: cierre.monto,
        excedenteMinutos: cierre.excedenteMinutos,
        excedenteMonto: cierre.excedenteMonto,
        recargoBoletoPerdido: cierre.recargoBoletoPerdido
      })
      await cargar(estacionamientoId)
    } catch (e) {
      setError(String(e))
    } finally {
      setCobrandoId(null)
    }
  }

  function cobrar(boletoId: number): void {
    cerrar(boletoId, false)
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
      <div style={{ maxWidth: 700, flex: '1 1 700px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Boletos abiertos</h1>
          <button onClick={onVolver}>Volver</button>
        </div>

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
              const folioTexto = formatearFolio(b.serie, b.folio, claveFolio)
              return (
                <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td>{folioTexto}</td>
                  <td>{b.tipoVehiculo}</td>
                  <td>{b.placa ?? '—'}</td>
                  <td>{new Date(b.horaEntrada).toLocaleString()}</td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => cobrar(b.id)} disabled={cobrandoId === b.id}>
                      Cobrar
                    </button>
                    <button onClick={() => setBoletoPerdidoId(b.id)} disabled={cobrandoId === b.id}>
                      Boleto perdido
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {boletos.length === 0 && <p style={{ color: '#666' }}>No hay boletos abiertos.</p>}
      </div>

      <div style={{ width: 340, flex: '0 0 340px' }}>
        <div
          style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: '#999',
            marginBottom: '0.5rem'
          }}
        >
          Último cobro
        </div>
        {ultimoCobro ? (
          <>
            <div style={{ border: '1px solid #e2e0da', borderRadius: 8, padding: '1rem', boxSizing: 'border-box' }}>
              <ReciboCobro datos={ultimoCobro} claveFolio={claveFolio} />
            </div>
            <button onClick={imprimirRecibo} style={{ marginTop: '0.75rem', width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}>
              Reimprimir recibo
            </button>
          </>
        ) : (
          <div
            style={{
              border: '1px dashed #ccc',
              borderRadius: 8,
              padding: '3rem 1rem',
              textAlign: 'center',
              color: '#999',
              fontSize: '0.85rem',
              boxSizing: 'border-box'
            }}
          >
            Aquí va a aparecer el recibo al cobrar un boleto.
          </div>
        )}
      </div>

      {boletoPerdidoId !== null && (
        <ConfirmModal
          mensaje={`¿Cerrar como boleto perdido? Se cobra lo normal más un recargo de $${cargoBoletoPerdido.toFixed(2)}.`}
          onSi={() => {
            const id = boletoPerdidoId
            setBoletoPerdidoId(null)
            cerrar(id, true)
          }}
          onNo={() => setBoletoPerdidoId(null)}
        />
      )}

      {preguntandoImprimirRecibo && (
        <ConfirmModal
          mensaje="¿Imprimir recibo?"
          onSi={() => {
            setPreguntandoImprimirRecibo(false)
            imprimirRecibo()
          }}
          onNo={() => setPreguntandoImprimirRecibo(false)}
        />
      )}
    </div>
  )
}

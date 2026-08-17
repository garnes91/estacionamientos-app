import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { formatearFolio } from '../logic/folioBarcode'

interface Corte {
  id: number
  desde: string
  hasta: string
  totalBoletos: number
  totalMonto: number
  usuarioId: number
}

interface DetalleCorteBoleto {
  id: number
  serie: string
  folio: number
  tipoVehiculo: string
  horaEntrada: string
  horaSalida: string
  monto: number
}

interface DetalleCortePorSerie {
  serie: string
  boletos: DetalleCorteBoleto[]
  totalBoletos: number
  totalMonto: number
}

interface DetalleCorte extends Corte {
  porTipoVehiculo: { tipoVehiculo: string; boletos: number; monto: number }[]
  porSerie: DetalleCortePorSerie[]
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString()
}

function TablaBoletos({ boletos }: { boletos: DetalleCorteBoleto[] }): ReactElement {
  return (
    <table cellPadding={4} style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
          <th>Folio</th>
          <th>Vehículo</th>
          <th>Entrada</th>
          <th>Salida</th>
          <th>Monto</th>
        </tr>
      </thead>
      <tbody>
        {boletos.map((b) => (
          <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
            <td>{formatearFolio(b.serie, b.folio)}</td>
            <td>{b.tipoVehiculo}</td>
            <td>{formatearFecha(b.horaEntrada)}</td>
            <td>{formatearFecha(b.horaSalida)}</td>
            <td>${b.monto.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CorteCaja({
  nombreUsuario,
  onVolver
}: {
  nombreUsuario: string
  onVolver: () => void
}): ReactElement {
  const [estacionamientoId, setEstacionamientoId] = useState<number | null>(null)
  const [nombreEstacionamiento, setNombreEstacionamiento] = useState('')
  const [historial, setHistorial] = useState<Corte[]>([])
  const [detalleActual, setDetalleActual] = useState<DetalleCorte | null>(null)
  const [generando, setGenerando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Marca que detalleActual viene de "Generar corte" (no de "Ver" en el
  // historial), para saber si toca imprimir y enviar por correo solos —
  // entre menos clicks tenga que hacer el operador, mejor.
  const justoGeneradoRef = useRef(false)

  async function cargarHistorial(estId: number): Promise<void> {
    setHistorial(await window.api.cortes.listar(estId))
  }

  useEffect(() => {
    window.api.estacionamientoActual().then((e) => {
      setEstacionamientoId(e.id)
      setNombreEstacionamiento(e.nombre)
      cargarHistorial(e.id).catch((err) => setError(String(err)))
    })
  }, [])

  async function generar(): Promise<void> {
    if (!estacionamientoId) return
    setGenerando(true)
    setError(null)
    try {
      const corte = await window.api.cortes.hacer(estacionamientoId)
      const detalle = await window.api.cortes.detalle(corte.id)
      justoGeneradoRef.current = true
      setDetalleActual(detalle)
      await cargarHistorial(estacionamientoId)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerando(false)
    }
  }

  async function verDetalle(corteId: number): Promise<void> {
    try {
      justoGeneradoRef.current = false
      setDetalleActual(await window.api.cortes.detalle(corteId))
    } catch (e) {
      setError(String(e))
    }
  }

  async function imprimirElemento(id: string): Promise<void> {
    const elemento = document.getElementById(id)
    if (!elemento) return
    try {
      await window.api.imprimir({ html: elemento.outerHTML, tipo: 'reporte' })
    } catch (e) {
      setError(String(e))
    }
  }

  async function enviarPorCorreo(automatico = false): Promise<void> {
    const elemento = document.getElementById('corte-general-imprimible')
    if (!elemento || !detalleActual) return
    setEnviando(true)
    if (!automatico) {
      setError(null)
      setMensaje(null)
    }
    try {
      await window.api.cortes.enviarPorCorreo({ corteId: detalleActual.id, htmlReporte: elemento.outerHTML })
      setMensaje('Corte enviado por correo (PDF + Excel adjuntos)')
    } catch (e) {
      // Al enviar solo (sin que el operador haya dado clic), no lo alarmamos
      // si simplemente no configuraron correo — eso es válido, no un error.
      const noConfigurado = String(e).includes('No hay configuración de correo')
      if (!(automatico && noConfigurado)) setError(String(e))
    } finally {
      setEnviando(false)
    }
  }

  // Al generar un corte nuevo (no al solo verlo en el historial), se
  // imprime y se manda por correo automáticamente — es lo que por ley hay
  // que archivar, y los operadores no deberían tener que acordarse de dar
  // más clics para eso.
  useEffect(() => {
    if (!detalleActual || !justoGeneradoRef.current) return
    justoGeneradoRef.current = false
    imprimirElemento('corte-general-imprimible')
    enviarPorCorreo(true)
  }, [detalleActual])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Corte de caja</h1>
        <button onClick={onVolver}>Volver</button>
      </div>

      {mensaje && <p style={{ background: '#eefbea', padding: '0.5rem 0.75rem', borderRadius: 4 }}>{mensaje}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <button onClick={generar} disabled={generando} style={{ margin: '1rem 0', padding: '0.5rem 1rem' }}>
        Generar corte
      </button>
      <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '-0.5rem' }}>
        Al generar, el corte general se imprime y se manda por correo solo (si el correo está configurado) — no hace
        falta ningún otro clic.
      </p>

      {detalleActual && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.5rem 0' }}>
            <h2 style={{ margin: 0 }}>Corte general</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => imprimirElemento('corte-general-imprimible')}>Reimprimir corte general</button>
              <button onClick={() => enviarPorCorreo()} disabled={enviando}>
                Reenviar por correo
              </button>
            </div>
          </div>

          <div id="corte-general-imprimible">
            <h2 style={{ marginBottom: 0 }}>{nombreEstacionamiento}</h2>
            <p style={{ color: '#666', margin: '0.25rem 0' }}>Corte de caja — todas las series</p>
            <p>
              Periodo: {formatearFecha(detalleActual.desde)} — {formatearFecha(detalleActual.hasta)}
            </p>
            <p>Generado por: {nombreUsuario}</p>

            <h3>Por tipo de vehículo</h3>
            <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th>Tipo de vehículo</th>
                  <th>Boletos</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {detalleActual.porTipoVehiculo.map((fila) => (
                  <tr key={fila.tipoVehiculo} style={{ borderBottom: '1px solid #eee' }}>
                    <td>{fila.tipoVehiculo}</td>
                    <td>{fila.boletos}</td>
                    <td>${fila.monto.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Detalle por serie</h3>
            {detalleActual.porSerie.map((s) => (
              <div key={s.serie} style={{ marginBottom: '1rem' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  Serie {s.serie} — {s.totalBoletos} boletos, ${s.totalMonto.toFixed(2)}
                </p>
                <TablaBoletos boletos={s.boletos} />
              </div>
            ))}

            <p style={{ fontWeight: 'bold', fontSize: '1.1rem', borderTop: '2px solid #333', paddingTop: '0.5rem' }}>
              Total general: {detalleActual.totalBoletos} boletos, ${detalleActual.totalMonto.toFixed(2)}
            </p>
          </div>

          <h2 style={{ marginTop: '2rem' }}>Por serie (imprimir por separado)</h2>
          {detalleActual.porSerie.map((s) => (
            <div key={s.serie} style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>
                  Serie {s.serie} — {s.totalBoletos} boletos, ${s.totalMonto.toFixed(2)}
                </h3>
                <button onClick={() => imprimirElemento(`corte-serie-${s.serie}-imprimible`)}>
                  Imprimir serie {s.serie}
                </button>
              </div>
              <div id={`corte-serie-${s.serie}-imprimible`}>
                <h2 style={{ marginBottom: 0 }}>{nombreEstacionamiento}</h2>
                <p style={{ color: '#666', margin: '0.25rem 0' }}>Corte de caja — serie {s.serie}</p>
                <p>
                  Periodo: {formatearFecha(detalleActual.desde)} — {formatearFecha(detalleActual.hasta)}
                </p>
                <p>Generado por: {nombreUsuario}</p>
                <TablaBoletos boletos={s.boletos} />
                <p style={{ fontWeight: 'bold', borderTop: '2px solid #333', paddingTop: '0.5rem' }}>
                  Total serie {s.serie}: {s.totalBoletos} boletos, ${s.totalMonto.toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </>
      )}

      <h2 style={{ marginTop: '2rem' }}>Historial</h2>
      <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>Hasta</th>
            <th>Boletos</th>
            <th>Monto</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {historial.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{formatearFecha(c.hasta)}</td>
              <td>{c.totalBoletos}</td>
              <td>${c.totalMonto.toFixed(2)}</td>
              <td>
                <button onClick={() => verDetalle(c.id)}>Ver</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {historial.length === 0 && <p style={{ color: '#666' }}>Todavía no se ha generado ningún corte.</p>}
    </div>
  )
}

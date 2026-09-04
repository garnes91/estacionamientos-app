import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { formatearFolio } from '../logic/folioBarcode'

interface Corte {
  id: number
  desde: string
  hasta: string
  totalBoletos: number
  totalMonto: number
  pensionadosPagosCantidad: number
  pensionadosPagosMonto: number
  gastosEfectivoCantidad: number
  gastosEfectivoMonto: number
  usuarioId: number
}

interface Gasto {
  id: number
  concepto: string
  categoria: string
  monto: number
  formaPago: string
  fecha: string
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
  desde: string
  hasta: string
  boletos: DetalleCorteBoleto[]
  totalBoletos: number
  totalMonto: number
}

interface DetalleCortePensionadoPago {
  id: number
  pensionadoNombre: string
  monto: number
  periodoDesde: string
  periodoHasta: string
  fechaPago: string
}

interface DetalleCortePensionadoEvento {
  id: number
  nombre: string
  fecha: string
}

interface DetalleCorte extends Corte {
  porTipoVehiculo: { tipoVehiculo: string; boletos: number; monto: number }[]
  porSerie: DetalleCortePorSerie[]
  pagosPensionados: DetalleCortePensionadoPago[]
  altasPensionados: DetalleCortePensionadoEvento[]
  bajasPensionados: DetalleCortePensionadoEvento[]
  gastosDelPeriodo: Gasto[]
}

function totalEnCaja(c: Corte): number {
  return c.totalMonto + c.pensionadosPagosMonto - c.gastosEfectivoMonto
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString()
}

function TablaBoletos({ boletos, claveFolio }: { boletos: DetalleCorteBoleto[]; claveFolio: string }): ReactElement {
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
            <td>{formatearFolio(b.serie, b.folio, claveFolio)}</td>
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
  const [claveFolio, setClaveFolio] = useState('')
  const [soloSerieA, setSoloSerieA] = useState(false)
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
      setClaveFolio(e.claveFolio)
      cargarHistorial(e.id).catch((err) => setError(String(err)))
      window.api.modoSoloSerieA.estado(e.id).then(setSoloSerieA)
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

  /**
   * `conDatosCrudo`: solo el corte general trae los datos estructurados
   * para el modo crudo (ver src/main/escpos.ts, construirReporteCorte) —
   * el corte por serie sigue imprimiéndose vía HTML por ahora.
   */
  async function imprimirElemento(id: string, conDatosCrudo: boolean): Promise<void> {
    const elemento = document.getElementById(id)
    if (!elemento) return
    try {
      await window.api.imprimir({
        html: elemento.outerHTML,
        tipo: 'reporte',
        datosReporte:
          conDatosCrudo && detalleActual
            ? {
                estacionamientoNombre: nombreEstacionamiento,
                generadoPor: nombreUsuario,
                soloSerieA,
                desde: detalleActual.desde,
                hasta: detalleActual.hasta,
                porTipoVehiculo: detalleActual.porTipoVehiculo,
                altasPensionados: detalleActual.altasPensionados.map((a) => a.nombre),
                bajasPensionados: detalleActual.bajasPensionados.map((b) => b.nombre),
                pagosPensionados: detalleActual.pagosPensionados.map((p) => ({
                  pensionadoNombre: p.pensionadoNombre,
                  monto: p.monto
                })),
                gastosDelPeriodo: detalleActual.gastosDelPeriodo.map((g) => ({
                  concepto: g.concepto,
                  monto: g.monto
                })),
                totalBoletos: detalleActual.totalBoletos,
                totalMonto: detalleActual.totalMonto,
                pensionadosPagosCantidad: detalleActual.pensionadosPagosCantidad,
                pensionadosPagosMonto: detalleActual.pensionadosPagosMonto,
                gastosEfectivoCantidad: detalleActual.gastosEfectivoCantidad,
                gastosEfectivoMonto: detalleActual.gastosEfectivoMonto
              }
            : undefined
      })
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
    imprimirElemento('corte-general-imprimible', true)
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
              <button onClick={() => imprimirElemento('corte-general-imprimible', true)}>Reimprimir corte general</button>
              <button onClick={() => enviarPorCorreo()} disabled={enviando}>
                Reenviar por correo
              </button>
            </div>
          </div>

          <div id="corte-general-imprimible">
            <h2 style={{ marginBottom: 0 }}>{nombreEstacionamiento}</h2>
            <p style={{ color: '#666', margin: '0.25rem 0' }}>Corte de caja</p>
            <p>
              {soloSerieA ? 'Periodo' : 'Periodo (pensionados y gastos)'}: {formatearFecha(detalleActual.desde)} —{' '}
              {formatearFecha(detalleActual.hasta)}
            </p>
            {!soloSerieA && (
              <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '-0.5rem' }}>
                Cada serie de boletos tiene su propio periodo abajo — pueden diferir si alguna estuvo desactivada.
              </p>
            )}
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

            {(detalleActual.pagosPensionados.length > 0 ||
              detalleActual.altasPensionados.length > 0 ||
              detalleActual.bajasPensionados.length > 0) && (
              <>
                <h3>Pensionados</h3>
                {detalleActual.altasPensionados.length > 0 && (
                  <p>
                    Altas ({detalleActual.altasPensionados.length}): {detalleActual.altasPensionados.map((a) => a.nombre).join(', ')}
                  </p>
                )}
                {detalleActual.bajasPensionados.length > 0 && (
                  <p>
                    Bajas ({detalleActual.bajasPensionados.length}): {detalleActual.bajasPensionados.map((b) => b.nombre).join(', ')}
                  </p>
                )}
                {detalleActual.pagosPensionados.length > 0 && (
                  <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                        <th>Pensionado</th>
                        <th>Periodo</th>
                        <th>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalleActual.pagosPensionados.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td>{p.pensionadoNombre}</td>
                          <td>
                            {formatearFecha(p.periodoDesde)} — {formatearFecha(p.periodoHasta)}
                          </td>
                          <td>${p.monto.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}

            {detalleActual.gastosDelPeriodo.length > 0 && (
              <>
                <h3>Gastos</h3>
                <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                      <th>Concepto</th>
                      <th>Categoría</th>
                      <th>Forma de pago</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleActual.gastosDelPeriodo.map((g) => (
                      <tr key={g.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td>{g.concepto}</td>
                        <td>{g.categoria}</td>
                        <td>{g.formaPago}</td>
                        <td>${g.monto.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ color: '#666', fontSize: '0.8rem' }}>
                  Solo los de forma de pago "efectivo" se restan del total en caja de abajo — los demás quedan
                  registrados aquí para control, pero se pagaron aparte.
                </p>
              </>
            )}

            <h3>{soloSerieA ? 'Detalle de boletos' : 'Detalle por serie'}</h3>
            {detalleActual.porSerie.map((s) => (
              <div key={s.serie} style={{ marginBottom: '1rem' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  {soloSerieA ? 'Boletos' : `Serie ${s.serie}`} — {s.totalBoletos} boletos, ${s.totalMonto.toFixed(2)}
                </p>
                {!soloSerieA && (
                  <p style={{ color: '#666', fontSize: '0.8rem', margin: '0 0 0.25rem' }}>
                    Periodo: {formatearFecha(s.desde)} — {formatearFecha(s.hasta)}
                  </p>
                )}
                <TablaBoletos boletos={s.boletos} claveFolio={claveFolio} />
              </div>
            ))}

            <p style={{ fontWeight: 'bold', fontSize: '1.1rem', borderTop: '2px solid #333', paddingTop: '0.5rem', marginBottom: 0 }}>
              Total general (boletos): {detalleActual.totalBoletos} boletos, ${detalleActual.totalMonto.toFixed(2)}
            </p>
            {detalleActual.pensionadosPagosMonto > 0 && (
              <p style={{ margin: '0.25rem 0' }}>
                Pensionados: {detalleActual.pensionadosPagosCantidad} pagos, ${detalleActual.pensionadosPagosMonto.toFixed(2)}
              </p>
            )}
            {detalleActual.gastosEfectivoMonto > 0 && (
              <p style={{ margin: '0.25rem 0' }}>
                Gastos en efectivo: {detalleActual.gastosEfectivoCantidad}, -${detalleActual.gastosEfectivoMonto.toFixed(2)}
              </p>
            )}
            <p style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>Total en caja: ${totalEnCaja(detalleActual).toFixed(2)}</p>
          </div>

          {!soloSerieA && (
            <>
              <h2 style={{ marginTop: '2rem' }}>Por serie (imprimir por separado)</h2>
              {detalleActual.porSerie.map((s) => (
                <div key={s.serie} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>
                      Serie {s.serie} — {s.totalBoletos} boletos, ${s.totalMonto.toFixed(2)}
                    </h3>
                    <button onClick={() => imprimirElemento(`corte-serie-${s.serie}-imprimible`, false)}>
                      Imprimir serie {s.serie}
                    </button>
                  </div>
                  <div id={`corte-serie-${s.serie}-imprimible`}>
                    <h2 style={{ marginBottom: 0 }}>{nombreEstacionamiento}</h2>
                    <p style={{ color: '#666', margin: '0.25rem 0' }}>Corte de caja — serie {s.serie}</p>
                    <p>
                      Periodo: {formatearFecha(s.desde)} — {formatearFecha(s.hasta)}
                    </p>
                    <p>Generado por: {nombreUsuario}</p>
                    <TablaBoletos boletos={s.boletos} claveFolio={claveFolio} />
                    <p style={{ fontWeight: 'bold', borderTop: '2px solid #333', paddingTop: '0.5rem' }}>
                      Total serie {s.serie}: {s.totalBoletos} boletos, ${s.totalMonto.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {!soloSerieA && (
        <>
          <h2 style={{ marginTop: '2rem' }}>Historial</h2>
          <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                <th>Hasta</th>
                <th>Boletos</th>
                <th>Monto</th>
                <th>Pensiones</th>
                <th>Gastos</th>
                <th>Total en caja</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {historial.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td>{formatearFecha(c.hasta)}</td>
                  <td>{c.totalBoletos}</td>
                  <td>${c.totalMonto.toFixed(2)}</td>
                  <td>{c.pensionadosPagosMonto > 0 ? `$${c.pensionadosPagosMonto.toFixed(2)}` : '—'}</td>
                  <td>{c.gastosEfectivoMonto > 0 ? `-$${c.gastosEfectivoMonto.toFixed(2)}` : '—'}</td>
                  <td>${totalEnCaja(c).toFixed(2)}</td>
                  <td>
                    <button onClick={() => verDetalle(c.id)}>Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {historial.length === 0 && <p style={{ color: '#666' }}>Todavía no se ha generado ningún corte.</p>}
        </>
      )}
    </div>
  )
}

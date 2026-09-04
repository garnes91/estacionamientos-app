import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { PensionadoTicket, DatosTicketPensionado } from './PensionadoTicket'
import { ConfirmModal } from './ConfirmModal'

const inputStyle: React.CSSProperties = { padding: '0.35rem', fontSize: '0.9rem' }

/**
 * `<input type="date">` da "YYYY-MM-DD" — convertirlo con
 * `new Date(texto).toISOString()` lo interpreta como medianoche UTC, que en
 * México cae horas antes de la medianoche local. Se construye con el
 * mediodía LOCAL de ese día para que quede del lado correcto sin importar
 * el huso horario (ver el mismo arreglo, con más detalle, en Gastos.tsx).
 */
function fechaSeleccionadaAIso(fechaTexto: string): string {
  const [anio, mes, dia] = fechaTexto.split('-').map(Number)
  return new Date(anio, mes - 1, dia, 12, 0, 0).toISOString()
}

interface TipoVehiculoOpcion {
  id: number
  nombre: string
}

interface Pensionado {
  id: number
  nombre: string
  telefono: string | null
  placa: string | null
  tipoVehiculoId: number
  tipoVehiculo: string
  cuotaMensual: number
  fechaAlta: string
  estado: 'activo' | 'baja'
  fechaBaja: string | null
  vigenteHasta: string
}

export function Pensionados({ onVolver }: { onVolver: () => void }): ReactElement {
  const [estacionamientoId, setEstacionamientoId] = useState<number | null>(null)
  const [nombreEstacionamiento, setNombreEstacionamiento] = useState('')
  const [tiposVehiculo, setTiposVehiculo] = useState<TipoVehiculoOpcion[]>([])
  const [pensionados, setPensionados] = useState<Pensionado[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ultimoTicket, setUltimoTicket] = useState<DatosTicketPensionado | null>(null)

  const [mostrarFormAlta, setMostrarFormAlta] = useState(false)
  const [formAlta, setFormAlta] = useState({ nombre: '', telefono: '', placa: '', tipoVehiculoId: 0, cuotaMensual: 0 })
  const [guardandoAlta, setGuardandoAlta] = useState(false)

  const [pensionadoPagoId, setPensionadoPagoId] = useState<number | null>(null)
  const [formPago, setFormPago] = useState({ periodoDesde: '', periodoHasta: '', monto: 0 })
  const [guardandoPago, setGuardandoPago] = useState(false)

  const [confirmandoBajaId, setConfirmandoBajaId] = useState<number | null>(null)
  const [dandoDeBaja, setDandoDeBaja] = useState(false)

  async function cargar(estId: number): Promise<void> {
    setPensionados(await window.api.pensionados.listar({ estacionamientoId: estId }))
  }

  useEffect(() => {
    window.api.estacionamientoActual().then((e) => {
      setEstacionamientoId(e.id)
      setNombreEstacionamiento(e.nombre)
      window.api.listarTiposVehiculo(e.id).then((tipos) => {
        setTiposVehiculo(tipos)
        setFormAlta((f) => ({ ...f, tipoVehiculoId: tipos[0]?.id ?? 0 }))
      })
      cargar(e.id).catch((err) => setError(String(err)))
    })
  }, [])

  function avisar(texto: string): void {
    setMensaje(texto)
    setError(null)
    setTimeout(() => setMensaje(null), 3000)
  }

  /**
   * Imprime dos copias del comprobante — una para el cliente, otra para el
   * estacionamiento — siempre, sin preguntar (a diferencia del recibo de
   * boleto, aquí no es opcional). flushSync fuerza a React a pintar el
   * ticket en el DOM antes de leer su outerHTML, ya que esto corre justo
   * después de un setState y no hay clic de por medio que garantice que ya
   * se re-renderizó.
   */
  async function imprimirDosCopias(datos: DatosTicketPensionado): Promise<void> {
    flushSync(() => setUltimoTicket(datos))
    const elemento = document.getElementById('pensionado-ticket')
    if (!elemento) return
    try {
      await window.api.imprimir({ html: elemento.outerHTML, tipo: 'ticket', datosTicket: { variante: 'pensionado', datos } })
      await window.api.imprimir({ html: elemento.outerHTML, tipo: 'ticket', datosTicket: { variante: 'pensionado', datos } })
    } catch (e) {
      setError(String(e))
    }
  }

  async function reimprimir(): Promise<void> {
    const elemento = document.getElementById('pensionado-ticket')
    if (!elemento || !ultimoTicket) return
    try {
      await window.api.imprimir({
        html: elemento.outerHTML,
        tipo: 'ticket',
        datosTicket: { variante: 'pensionado', datos: ultimoTicket }
      })
    } catch (e) {
      setError(String(e))
    }
  }

  async function darDeAlta(): Promise<void> {
    if (!estacionamientoId) return
    setGuardandoAlta(true)
    setError(null)
    try {
      const creado = await window.api.pensionados.crear({
        estacionamientoId,
        nombre: formAlta.nombre,
        telefono: formAlta.telefono || null,
        placa: formAlta.placa || null,
        tipoVehiculoId: formAlta.tipoVehiculoId,
        cuotaMensual: formAlta.cuotaMensual
      })
      await cargar(estacionamientoId)
      setMostrarFormAlta(false)
      setFormAlta({ nombre: '', telefono: '', placa: '', tipoVehiculoId: tiposVehiculo[0]?.id ?? 0, cuotaMensual: 0 })
      avisar('Pensionado dado de alta')
      await imprimirDosCopias({
        tipo: 'alta',
        folio: creado.id,
        estacionamientoNombre: nombreEstacionamiento,
        nombre: creado.nombre,
        placa: creado.placa,
        tipoVehiculo: creado.tipoVehiculo,
        fecha: creado.fechaAlta,
        cuotaMensual: creado.cuotaMensual
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setGuardandoAlta(false)
    }
  }

  async function abrirFormPago(pensionado: Pensionado): Promise<void> {
    setPensionadoPagoId(pensionado.id)
    const sugerido = await window.api.pensionados.sugerirSiguientePeriodo(pensionado.id)
    setFormPago({ periodoDesde: sugerido.periodoDesde, periodoHasta: sugerido.periodoHasta, monto: pensionado.cuotaMensual })
  }

  async function confirmarPago(pensionado: Pensionado): Promise<void> {
    setGuardandoPago(true)
    setError(null)
    try {
      const pago = await window.api.pensionados.registrarPago({
        pensionadoId: pensionado.id,
        periodoDesde: formPago.periodoDesde,
        periodoHasta: formPago.periodoHasta,
        monto: formPago.monto
      })
      if (estacionamientoId) await cargar(estacionamientoId)
      setPensionadoPagoId(null)
      avisar('Pago registrado')
      await imprimirDosCopias({
        tipo: 'pago',
        folio: pago.id,
        estacionamientoNombre: nombreEstacionamiento,
        nombre: pensionado.nombre,
        placa: pensionado.placa,
        tipoVehiculo: pensionado.tipoVehiculo,
        fecha: new Date().toISOString(),
        monto: pago.monto,
        periodoDesde: pago.periodoDesde,
        periodoHasta: pago.periodoHasta
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setGuardandoPago(false)
    }
  }

  async function confirmarBaja(pensionado: Pensionado): Promise<void> {
    if (dandoDeBaja) return
    setDandoDeBaja(true)
    setError(null)
    try {
      await window.api.pensionados.darDeBaja(pensionado.id)
      if (estacionamientoId) await cargar(estacionamientoId)
      setConfirmandoBajaId(null)
      avisar('Pensionado dado de baja')
      await imprimirDosCopias({
        tipo: 'baja',
        folio: pensionado.id,
        estacionamientoNombre: nombreEstacionamiento,
        nombre: pensionado.nombre,
        placa: pensionado.placa,
        tipoVehiculo: pensionado.tipoVehiculo,
        fecha: new Date().toISOString(),
        cuotaMensual: pensionado.cuotaMensual
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setDandoDeBaja(false)
    }
  }

  const pensionadoEnPago = pensionados.find((p) => p.id === pensionadoPagoId) ?? null

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
      <div style={{ maxWidth: 760, flex: '1 1 760px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Pensionados</h1>
          <button onClick={onVolver}>Volver</button>
        </div>

        {mensaje && <p style={{ background: '#eefbea', padding: '0.5rem 0.75rem', borderRadius: 4 }}>{mensaje}</p>}
        {error && <p style={{ color: 'crimson' }}>{error}</p>}

        <div style={{ margin: '1rem 0' }}>
          {!mostrarFormAlta ? (
            <button onClick={() => setMostrarFormAlta(true)}>+ Nuevo pensionado</button>
          ) : (
            <div style={{ border: '1px solid #e2e0da', borderRadius: 8, padding: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0.5rem', alignItems: 'center', maxWidth: 420 }}>
                <label>Nombre</label>
                <input
                  style={inputStyle}
                  value={formAlta.nombre}
                  onChange={(e) => setFormAlta({ ...formAlta, nombre: e.target.value })}
                />
                <label>Teléfono</label>
                <input
                  style={inputStyle}
                  value={formAlta.telefono}
                  onChange={(e) => setFormAlta({ ...formAlta, telefono: e.target.value })}
                />
                <label>Placa</label>
                <input
                  style={inputStyle}
                  value={formAlta.placa}
                  onChange={(e) => setFormAlta({ ...formAlta, placa: e.target.value })}
                />
                <label>Tipo de vehículo</label>
                <select
                  style={inputStyle}
                  value={formAlta.tipoVehiculoId}
                  onChange={(e) => setFormAlta({ ...formAlta, tipoVehiculoId: Number(e.target.value) })}
                >
                  {tiposVehiculo.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
                <label>Cuota mensual</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={formAlta.cuotaMensual}
                  onChange={(e) => setFormAlta({ ...formAlta, cuotaMensual: Number(e.target.value) })}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button onClick={darDeAlta} disabled={guardandoAlta || !formAlta.nombre.trim()}>
                  Dar de alta (imprime 2 comprobantes)
                </button>
                <button onClick={() => setMostrarFormAlta(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {pensionadoEnPago && (
          <div style={{ border: '1px solid #e2e0da', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
            <p style={{ marginTop: 0 }}>
              Confirmar pago de <strong>{pensionadoEnPago.nombre}</strong>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0.5rem', alignItems: 'center', maxWidth: 420 }}>
              <label>Periodo desde</label>
              <input
                style={inputStyle}
                type="date"
                value={formPago.periodoDesde.slice(0, 10)}
                onChange={(e) => setFormPago({ ...formPago, periodoDesde: fechaSeleccionadaAIso(e.target.value) })}
              />
              <label>Periodo hasta</label>
              <input
                style={inputStyle}
                type="date"
                value={formPago.periodoHasta.slice(0, 10)}
                onChange={(e) => setFormPago({ ...formPago, periodoHasta: fechaSeleccionadaAIso(e.target.value) })}
              />
              <label>Monto</label>
              <input
                style={inputStyle}
                type="number"
                value={formPago.monto}
                onChange={(e) => setFormPago({ ...formPago, monto: Number(e.target.value) })}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button onClick={() => confirmarPago(pensionadoEnPago)} disabled={guardandoPago}>
                Confirmar pago (imprime 2 comprobantes)
              </button>
              <button onClick={() => setPensionadoPagoId(null)}>Cancelar</button>
            </div>
          </div>
        )}

        <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th>Nombre</th>
              <th>Vehículo</th>
              <th>Placa</th>
              <th>Cuota</th>
              <th>Vigente hasta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pensionados.map((p) => {
              const vencido = new Date(p.vigenteHasta) < new Date()
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td>{p.nombre}</td>
                  <td>{p.tipoVehiculo}</td>
                  <td>{p.placa ?? '—'}</td>
                  <td>${p.cuotaMensual.toFixed(2)}</td>
                  <td style={{ color: vencido ? 'crimson' : undefined, fontWeight: vencido ? 'bold' : undefined }}>
                    {new Date(p.vigenteHasta).toLocaleDateString('es-MX')}
                    {vencido ? ' (vencido)' : ''}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => abrirFormPago(p)}>Confirmar pago</button>
                      <button onClick={() => setConfirmandoBajaId(p.id)}>Dar de baja</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {pensionados.length === 0 && <p style={{ color: '#666' }}>No hay pensionados activos.</p>}
      </div>

      <div style={{ width: 340, flex: '0 0 340px' }}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#999', marginBottom: '0.5rem' }}>
          Último comprobante
        </div>
        {ultimoTicket ? (
          <>
            <div style={{ border: '1px solid #e2e0da', borderRadius: 8, padding: '1rem', boxSizing: 'border-box' }}>
              <PensionadoTicket datos={ultimoTicket} />
            </div>
            <button onClick={reimprimir} style={{ marginTop: '0.75rem', width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}>
              Reimprimir (1 copia)
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
            Aquí va a aparecer el comprobante de la última acción (alta, baja o pago).
          </div>
        )}
      </div>

      {confirmandoBajaId !== null && (
        <ConfirmModal
          mensaje={`¿Dar de baja a ${pensionados.find((p) => p.id === confirmandoBajaId)?.nombre}? Se imprimen 2 comprobantes.`}
          onSi={() => {
            const pensionado = pensionados.find((p) => p.id === confirmandoBajaId)
            if (pensionado) confirmarBaja(pensionado)
          }}
          onNo={() => setConfirmandoBajaId(null)}
        />
      )}
    </div>
  )
}

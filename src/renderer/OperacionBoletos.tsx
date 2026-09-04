import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { parsearFolio } from '../logic/folioBarcode'
import { BoletoImprimible, DatosBoletoImprimible } from './BoletoImprimible'
import { ReciboCobro, DatosReciboCobro } from './ReciboCobro'
import { ConfirmModal } from './ConfirmModal'

/**
 * Los errores que cruzan IPC llegan envueltos por Electron como
 * `Error invoking remote method '...': Error: <mensaje real>` — se muestra
 * solo la parte que le sirve al operador en caja, no el envoltorio técnico.
 */
function limpiarError(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e)
  const match = texto.match(/Error invoking remote method '[^']*':\s*Error:\s*(.+)$/s)
  return match ? match[1] : texto
}

interface TipoVehiculo {
  id: number
  nombre: string
}

interface TarifaPlana {
  id: number
  tipoVehiculoId: number
  nombre: string
  precioFijo: number
  horasIncluidas: number
  activo: boolean
}

interface Resumen {
  entradasDesdeUltimoCorte: number
  actualmenteDentro: number
}

export interface UsuarioSesion {
  id: number
  nombreCompleto: string
  rol: 'admin' | 'empleado'
}

const TECLAS_TIPO: Record<string, number> = { F1: 0, F2: 1, F3: 2 }

export function OperacionBoletos({
  usuario,
  onCerrarSesion,
  onAbrirConfiguracion,
  onVerBoletosAbiertos,
  onVerCorte,
  onVerPensionados,
  onVerGastos,
  onVerCorteMensual
}: {
  usuario: UsuarioSesion
  onCerrarSesion: () => void
  onAbrirConfiguracion?: () => void
  onVerBoletosAbiertos: () => void
  onVerPensionados: () => void
  onVerGastos: () => void
  onVerCorteMensual: () => void
  onVerCorte: () => void
}): ReactElement {
  const [estacionamientoId, setEstacionamientoId] = useState<number | null>(null)
  const [nombreEstacionamiento, setNombreEstacionamiento] = useState('')
  const [textoBoleto, setTextoBoleto] = useState<string | null>(null)
  const [claveFolio, setClaveFolio] = useState('')
  const [tipos, setTipos] = useState<TipoVehiculo[]>([])
  const [tarifasPlanas, setTarifasPlanas] = useState<TarifaPlana[]>([])
  const [placa, setPlaca] = useState('')
  const placaRef = useRef<HTMLInputElement>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [ultimoEmitido, setUltimoEmitido] = useState<DatosBoletoImprimible | null>(null)
  const [ultimoCobro, setUltimoCobro] = useState<DatosReciboCobro | null>(null)
  const [folioEscaneado, setFolioEscaneado] = useState('')
  const [cargando, setCargando] = useState(false)
  const [cobrandoEscaneo, setCobrandoEscaneo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ahora, setAhora] = useState(new Date())
  const [soloSerieA, setSoloSerieA] = useState(false)
  const [cambiandoSoloSerieA, setCambiandoSoloSerieA] = useState(false)
  const [version, setVersion] = useState('')

  // Hora local de la computadora (no requiere ajustar zona horaria: casi
  // todas las instalaciones están en Ciudad de México, y esto sigue lo que
  // el sistema operativo ya tenga configurado).
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(intervalo)
  }, [])

  useEffect(() => {
    window.api.version().then(setVersion)
  }, [])

  useEffect(() => {
    async function cargarInicial(): Promise<void> {
      const estacionamiento = await window.api.estacionamientoActual()
      setEstacionamientoId(estacionamiento.id)
      setNombreEstacionamiento(estacionamiento.nombre)
      setTextoBoleto(estacionamiento.textoBoleto)
      setClaveFolio(estacionamiento.claveFolio)

      const tiposVehiculo = await window.api.listarTiposVehiculo(estacionamiento.id)
      setTipos(tiposVehiculo)

      const planas = await window.api.listarTarifasPlanas(estacionamiento.id)
      setTarifasPlanas(planas.filter((p) => p.activo))

      setResumen(await window.api.resumen(estacionamiento.id))
      setSoloSerieA(await window.api.modoSoloSerieA.estado(estacionamiento.id))
    }
    cargarInicial().catch((e) => setError(limpiarError(e)))
    placaRef.current?.focus()
  }, [])

  async function refrescarResumen(estId: number): Promise<void> {
    setResumen(await window.api.resumen(estId))
  }

  async function emitir(tipoVehiculoId: number, tarifaPlanaId: number | null = null): Promise<void> {
    if (!estacionamientoId || cargando) return
    setCargando(true)
    setError(null)
    try {
      const placaEnviada = placa.trim() || null
      const emitido = await window.api.emitirBoleto({
        estacionamientoId,
        tipoVehiculoId,
        placa: placaEnviada,
        tarifaPlanaId
      })
      const plana = tarifaPlanaId ? tarifasPlanas.find((p) => p.id === tarifaPlanaId) : undefined
      justoEmitidoRef.current = true
      setUltimoEmitido({
        estacionamientoNombre: nombreEstacionamiento,
        textoBoleto,
        serie: emitido.serie,
        folio: emitido.folio,
        tipoVehiculo: tipos.find((t) => t.id === tipoVehiculoId)?.nombre ?? '',
        placa: placaEnviada,
        horaEntrada: emitido.horaEntrada,
        tarifaPlana: plana ? { nombre: plana.nombre, precioFijo: plana.precioFijo, horasIncluidas: plana.horasIncluidas } : null
      })
      setPlaca('')
      placaRef.current?.focus()
      await refrescarResumen(estacionamientoId)
    } catch (e) {
      setError(limpiarError(e))
    } finally {
      setCargando(false)
    }
  }

  // Atajos de teclado para emitir sin soltar el teclado: F1 auto, F2 camioneta,
  // F3 camión (según el orden de tipos configurado), siempre a tarifa regular
  // (la tarifa plana solo se ofrece con clic, ver botones debajo de cada tipo).
  // En macOS, F1-F3 suelen estar mapeados a brillo/teclas multimedia salvo
  // que "fn" quede fijo como tecla de función estándar; en Windows (destino
  // de despliegue) funcionan directo.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const indice = TECLAS_TIPO[e.key]
      if (indice === undefined) return
      const tipo = tipos[indice]
      if (!tipo) return
      e.preventDefault()
      emitir(tipo.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tipos, cargando, estacionamientoId, placa, nombreEstacionamiento, textoBoleto, tarifasPlanas])

  // Atajo de emergencia (cualquier usuario, no solo admin): Ctrl+Shift+A
  // apaga de golpe todas las series salvo A (ej. se acabaron los boletos
  // físicos de la serie B a medio turno) y vuelve a presionarlo restaura
  // exactamente las series que estaban activas antes.
  async function alternarSoloSerieA(): Promise<void> {
    if (!estacionamientoId || cambiandoSoloSerieA) return
    setCambiandoSoloSerieA(true)
    setError(null)
    try {
      setSoloSerieA(await window.api.modoSoloSerieA.alternar(estacionamientoId))
    } catch (e) {
      setError(limpiarError(e))
    } finally {
      setCambiandoSoloSerieA(false)
    }
  }

  useEffect(() => {
    function onKeyDownSoloSerieA(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        alternarSoloSerieA()
      }
    }
    window.addEventListener('keydown', onKeyDownSoloSerieA)
    return () => window.removeEventListener('keydown', onKeyDownSoloSerieA)
  }, [estacionamientoId, cambiandoSoloSerieA])

  async function cobrarFolio(parseado: { serie: string; folio: number }, deEscaneoGlobal = false): Promise<void> {
    if (!estacionamientoId) return
    setCobrandoEscaneo(true)
    setError(null)
    try {
      const cierre = await window.api.cobrarBoletoPorFolio({ estacionamientoId, ...parseado })
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
        excedenteMonto: cierre.excedenteMonto
      })
      setFolioEscaneado('')
      // Un escaneo global puede haber dejado un carácter suelto en el campo
      // de placa (el primero de la ráfaga, antes de detectar que era un
      // escaneo) — se limpia para no contaminar el próximo boleto a emitir.
      if (deEscaneoGlobal) setPlaca('')
      await refrescarResumen(estacionamientoId)
    } catch (e) {
      setError(limpiarError(e))
    } finally {
      setCobrandoEscaneo(false)
    }
  }

  async function imprimirRecibo(): Promise<void> {
    const elemento = document.getElementById('recibo-cobro')
    if (!elemento || !ultimoCobro) return
    try {
      await window.api.imprimir({
        html: elemento.outerHTML,
        tipo: 'ticket',
        datosTicket: { variante: 'cobro', claveFolio, datos: ultimoCobro }
      })
    } catch (e) {
      setError(limpiarError(e))
    }
  }

  // Al cobrar (no al solo mostrar un cobro ya hecho), se pregunta si se
  // quiere imprimir el recibo. El recibo también se queda visible en el
  // panel de la derecha por si hace falta reimprimirlo.
  const justoCobradoRef = useRef(false)
  const [preguntandoImprimirRecibo, setPreguntandoImprimirRecibo] = useState(false)
  useEffect(() => {
    if (!ultimoCobro || !justoCobradoRef.current) return
    justoCobradoRef.current = false
    setPreguntandoImprimirRecibo(true)
  }, [ultimoCobro])

  async function cobrarEscaneado(): Promise<void> {
    if (!folioEscaneado.trim()) return
    const parseado = parsearFolio(folioEscaneado, claveFolio)
    if (!parseado) {
      setError(`"${folioEscaneado}" no tiene el formato de un folio (ej. 04837211)`)
      return
    }
    await cobrarFolio(parseado)
  }

  // Cobro automático por escaneo sin importar dónde esté el cursor: un
  // lector de códigos de barras "teclea" cada carácter y remata con Enter,
  // pero muchísimo más rápido que cualquier persona (unos pocos ms entre
  // teclas, frente a >100ms de un tecleo humano normal). Se arma un buffer
  // global con las teclas que llegan casi pegadas y, si al llegar Enter
  // forman un folio válido, se cobra directo — sin necesidad de haber
  // hecho clic antes en el campo de "folio escaneado".
  const UMBRAL_ESCANEO_MS = 40
  const ultimoTecleoRef = useRef(0)
  const bufferEscaneoRef = useRef('')
  const folioInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function alTecladoGlobal(e: KeyboardEvent): void {
      // Ignora teclas modificadoras/de navegación (Shift, flechas, etc.)
      // para el cálculo de tiempo: si no, un Shift+letra normal (humano)
      // podría medirse como "muy rápido" contra el keydown del Shift.
      if (e.key !== 'Enter' && e.key.length !== 1) return

      const ahora = performance.now()
      const transcurrido = ahora - ultimoTecleoRef.current
      ultimoTecleoRef.current = ahora

      if (e.key === 'Enter') {
        const buffer = bufferEscaneoRef.current
        bufferEscaneoRef.current = ''
        // Si el foco ya está en el campo de folio escaneado, su propio
        // onKeyDown (más abajo) ya se encarga de cobrar — hacerlo también
        // aquí duplicaría el cobro.
        if (transcurrido < UMBRAL_ESCANEO_MS && document.activeElement !== folioInputRef.current) {
          const parseado = parsearFolio(buffer, claveFolio)
          if (parseado) cobrarFolio(parseado, true)
        }
        return
      }

      if (e.key.length === 1) {
        const enRafaga = transcurrido < UMBRAL_ESCANEO_MS
        bufferEscaneoRef.current = enRafaga ? bufferEscaneoRef.current + e.key : e.key
        // A partir del 2do carácter de una ráfaga (la 1ra no se puede saber
        // de antemano) se evita que el escaneo se escriba también en el
        // campo que tenga el foco en ese momento (ej. la placa).
        if (enRafaga && document.activeElement !== folioInputRef.current) {
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', alTecladoGlobal)
    return () => window.removeEventListener('keydown', alTecladoGlobal)
  }, [estacionamientoId, claveFolio])

  async function cerrarSesion(): Promise<void> {
    await window.api.logout()
    onCerrarSesion()
  }

  async function imprimir(): Promise<void> {
    const elemento = document.getElementById('boleto-imprimible')
    if (!elemento || !ultimoEmitido) return
    try {
      await window.api.imprimir({
        html: elemento.outerHTML,
        tipo: 'ticket',
        datosTicket: { variante: 'entrada', claveFolio, datos: ultimoEmitido }
      })
    } catch (e) {
      setError(limpiarError(e))
    }
  }

  // El boleto de entrada se imprime solo al emitirse — cada auto que entra
  // necesita su ticket, no tiene sentido preguntar ni esperar un clic.
  const justoEmitidoRef = useRef(false)
  useEffect(() => {
    if (!ultimoEmitido || !justoEmitidoRef.current) return
    justoEmitidoRef.current = false
    imprimir()
  }, [ultimoEmitido])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
      <div style={{ maxWidth: 620, flex: '1 1 620px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h1 style={{ margin: 0 }}>{nombreEstacionamiento || 'Sistema de Estacionamientos'}</h1>
          <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#666' }}>
            <div>
              {usuario.nombreCompleto} · {usuario.rol}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', justifyContent: 'flex-end' }}>
              {onAbrirConfiguracion && <button onClick={onAbrirConfiguracion}>Configuración</button>}
              <button onClick={cerrarSesion}>Cerrar sesión</button>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', margin: '0.5rem 0 1.5rem' }}>
          <div style={{ fontSize: '3rem', fontWeight: 'bold', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {ahora.toLocaleTimeString('es-MX')}
          </div>
          <div style={{ fontSize: '1rem', color: '#666', textTransform: 'capitalize' }}>
            {ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        {resumen && (
          <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
            <div style={{ flex: 1, background: '#f4f4f4', borderRadius: 6, padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#666' }}>Entradas desde el último corte</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{resumen.entradasDesdeUltimoCorte}</div>
            </div>
            <div style={{ flex: 1, background: '#f4f4f4', borderRadius: 6, padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#666' }}>Actualmente dentro</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{resumen.actualmenteDentro}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
          <button onClick={onVerBoletosAbiertos}>Ver boletos abiertos</button>
          <button onClick={onVerCorte}>Corte de caja</button>
          <button onClick={onVerPensionados}>Pensionados</button>
          <button onClick={onVerGastos}>Gastos</button>
          {!soloSerieA && <button onClick={onVerCorteMensual}>Corte mensual</button>}
          {!soloSerieA && (
            <span style={{ marginLeft: 'auto', fontSize: '1.1rem', color: '#2e8b45', cursor: 'default' }}>✓</span>
          )}
        </div>

        <div style={{ margin: '1rem 0' }}>
          <input
            ref={placaRef}
            type="text"
            placeholder="Placa (opcional)"
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            style={{
              textTransform: 'uppercase',
              fontSize: '1rem',
              padding: '0.4rem',
              width: '100%',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {tipos.map((t, i) => {
            const planasDelTipo = tarifasPlanas.filter((p) => p.tipoVehiculoId === t.id)
            return (
              <div key={t.id} style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <button onClick={() => emitir(t.id)} disabled={cargando} style={{ padding: '1rem 0.5rem', fontSize: '1rem', lineHeight: 1.4 }}>
                  F{i + 1}
                  <br />
                  {t.nombre}
                </button>
                {planasDelTipo.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => emitir(t.id, p.id)}
                    disabled={cargando}
                    style={{ fontSize: '0.8rem', padding: '0.3rem' }}
                  >
                    {p.nombre} (${p.precioFijo}/{p.horasIncluidas}h)
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        {error && <p style={{ color: 'crimson' }}>{error}</p>}

        <h2>Cobrar por folio escaneado (salida)</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.5rem 0' }}>
          <input
            ref={folioInputRef}
            type="text"
            placeholder="Escanear o escribir folio, ej. 04837211"
            value={folioEscaneado}
            onChange={(e) => setFolioEscaneado(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cobrarEscaneado()}
            style={{ flex: 1 }}
          />
          <button onClick={cobrarEscaneado} disabled={cobrandoEscaneo || !folioEscaneado.trim()}>
            Cobrar
          </button>
        </div>
      </div>

      <div style={{ width: 340, flex: '0 0 340px' }}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#999', marginBottom: '0.5rem' }}>
          Último boleto
        </div>
        {ultimoEmitido ? (
          <>
            <div style={{ border: '1px solid #e2e0da', borderRadius: 8, padding: '1rem', boxSizing: 'border-box' }}>
              <BoletoImprimible datos={ultimoEmitido} claveFolio={claveFolio} />
            </div>
            <button onClick={imprimir} style={{ marginTop: '0.75rem', width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}>
              Reimprimir último boleto
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
            Aquí va a aparecer el boleto en cuanto emitas uno con F1, F2 o F3.
          </div>
        )}

        <div
          style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: '#999',
            margin: '1.5rem 0 0.5rem'
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

      {version && (
        <div style={{ position: 'fixed', bottom: '0.5rem', right: '0.75rem', fontSize: '0.7rem', color: '#ccc' }}>
          v{version}
        </div>
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

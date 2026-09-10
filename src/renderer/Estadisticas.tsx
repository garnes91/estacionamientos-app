import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'

interface ResultadoMensual {
  anio: number
  mes: number
  totalBoletos: number
  montoBoletos: number
  montoPensionados: number
  ingresos: number
  egresos: number
  resultadoNeto: number
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatearMonto(n: number): string {
  const signo = n < 0 ? '-' : ''
  return `${signo}$${Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
}

function calcularCambio(actual: number, anterior: number): { texto: string; color: string } {
  if (anterior === 0 && actual === 0) return { texto: '—', color: '#999' }
  if (anterior === 0) return { texto: 'nuevo', color: '#1a7f37' }
  const pct = ((actual - anterior) / Math.abs(anterior)) * 100
  const signo = pct >= 0 ? '+' : ''
  return { texto: `${signo}${pct.toFixed(0)}%`, color: pct >= 0 ? '#1a7f37' : '#c0392b' }
}

function FilaResumen({
  etiqueta,
  actual,
  anterior,
  mismoMesAnioPasado,
  negrita
}: {
  etiqueta: string
  actual: number
  anterior: number
  mismoMesAnioPasado: number
  negrita?: boolean
}): ReactElement {
  const vsAnterior = calcularCambio(actual, anterior)
  const vsAnioPasado = calcularCambio(actual, mismoMesAnioPasado)
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ fontWeight: negrita ? 'bold' : 'normal' }}>{etiqueta}</td>
      <td style={{ fontWeight: negrita ? 'bold' : 'normal', textAlign: 'right' }}>{formatearMonto(actual)}</td>
      <td style={{ color: vsAnterior.color, textAlign: 'right' }}>{vsAnterior.texto}</td>
      <td style={{ color: vsAnioPasado.color, textAlign: 'right' }}>{vsAnioPasado.texto}</td>
    </tr>
  )
}

export function Estadisticas({ onVolver }: { onVolver: () => void }): ReactElement {
  const [estacionamientoId, setEstacionamientoId] = useState<number | null>(null)
  const [meses, setMeses] = useState<ResultadoMensual[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.estacionamientoActual().then((e) => setEstacionamientoId(e.id))
  }, [])

  useEffect(() => {
    if (estacionamientoId == null) return
    window.api.estadisticas
      .ingresosPorMes(estacionamientoId)
      .then(setMeses)
      .catch((e) => setError(String(e)))
  }, [estacionamientoId])

  const actual = meses ? meses[meses.length - 1] : null
  const anterior = meses && meses.length >= 2 ? meses[meses.length - 2] : null
  const mismoMesAnioPasado = meses && meses.length >= 13 ? meses[0] : null

  const anchoGrafica = 780
  const altoBarras = 70
  const maxAbs = meses ? Math.max(1, ...meses.map((m) => Math.abs(m.resultadoNeto))) : 1

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Estadísticas</h1>
        <button onClick={onVolver}>Volver</button>
      </div>
      <p style={{ color: '#666', margin: '0.25rem 0 1.5rem' }}>
        Estado de resultados simplificado por mes calendario: ingresos (boletos + pensionados), egresos (todos los
        gastos, cualquier forma de pago) y el resultado neto.
      </p>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!meses && !error && <p style={{ color: '#999' }}>Cargando…</p>}

      {meses && actual && anterior && (
        <>
          <table cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 620 }}>
            <thead>
              <tr style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>
                <th style={{ textAlign: 'left' }}>
                  {MESES_CORTOS[actual.mes - 1]} {actual.anio}
                </th>
                <th>Monto</th>
                <th>vs mes anterior</th>
                <th>vs {mismoMesAnioPasado ? `${MESES_CORTOS[actual.mes - 1]} ${actual.anio - 1}` : 'hace un año'}</th>
              </tr>
            </thead>
            <tbody>
              <FilaResumen
                etiqueta="Ingresos"
                actual={actual.ingresos}
                anterior={anterior.ingresos}
                mismoMesAnioPasado={mismoMesAnioPasado?.ingresos ?? 0}
              />
              <FilaResumen
                etiqueta="Egresos"
                actual={actual.egresos}
                anterior={anterior.egresos}
                mismoMesAnioPasado={mismoMesAnioPasado?.egresos ?? 0}
              />
              <FilaResumen
                etiqueta="Resultado neto"
                actual={actual.resultadoNeto}
                anterior={anterior.resultadoNeto}
                mismoMesAnioPasado={mismoMesAnioPasado?.resultadoNeto ?? 0}
                negrita
              />
            </tbody>
          </table>
          {!mismoMesAnioPasado && (
            <p style={{ color: '#999', fontSize: '0.8rem' }}>
              Todavía no hay 12 meses de historial — la comparación contra el año pasado aparecerá cuando lo haya.
            </p>
          )}

          <h3 style={{ marginTop: '2rem', marginBottom: '0.5rem' }}>Resultado neto, últimos {meses.length} meses</h3>
          <svg width="100%" viewBox={`0 0 ${anchoGrafica} 150`} style={{ maxWidth: anchoGrafica }}>
            <line x1={0} y1={75} x2={anchoGrafica} y2={75} stroke="#ddd" />
            {meses.map((m, i) => {
              const columna = anchoGrafica / meses.length
              const barWidth = columna - 8
              const x = i * columna + 4
              const h = Math.round((Math.abs(m.resultadoNeto) / maxAbs) * altoBarras)
              const y = m.resultadoNeto >= 0 ? 75 - h : 75
              const esActual = i === meses.length - 1
              return (
                <g key={`${m.anio}-${m.mes}`}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(h, 1)}
                    fill={m.resultadoNeto >= 0 ? (esActual ? '#1a7f37' : '#8fcaa3') : esActual ? '#c0392b' : '#e4a89c'}
                  />
                  <text x={x + barWidth / 2} y={128} textAnchor="middle" fontSize="10" fill="#666">
                    {MESES_CORTOS[m.mes - 1]}
                  </text>
                  <text x={x + barWidth / 2} y={142} textAnchor="middle" fontSize="9" fill="#999">
                    {String(m.anio).slice(2)}
                  </text>
                </g>
              )
            })}
          </svg>

          <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1.5rem' }}>
            <thead>
              <tr style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>
                <th style={{ textAlign: 'left' }}>Mes</th>
                <th>Boletos</th>
                <th>Pensionados</th>
                <th>Ingresos</th>
                <th>Egresos</th>
                <th>Resultado neto</th>
              </tr>
            </thead>
            <tbody>
              {[...meses].reverse().map((m) => (
                <tr key={`${m.anio}-${m.mes}`} style={{ borderBottom: '1px solid #eee' }}>
                  <td>
                    {MESES_CORTOS[m.mes - 1]} {m.anio}
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatearMonto(m.montoBoletos)}</td>
                  <td style={{ textAlign: 'right' }}>{formatearMonto(m.montoPensionados)}</td>
                  <td style={{ textAlign: 'right' }}>{formatearMonto(m.ingresos)}</td>
                  <td style={{ textAlign: 'right' }}>{formatearMonto(m.egresos)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: m.resultadoNeto >= 0 ? '#1a7f37' : '#c0392b' }}>
                    {formatearMonto(m.resultadoNeto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

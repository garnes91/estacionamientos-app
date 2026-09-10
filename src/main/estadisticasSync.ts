import type { DB } from '../db'
import { obtenerConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { obtenerIngresosPorMes } from '../db/estadisticas'
import { codificarValorFirestore, parchearDocumento } from './firestoreRest'

/**
 * Sube el estado de resultados mensual (últimos 13 meses, ver
 * src/db/estadisticas.ts) al mismo documento Firestore que ya usa el
 * monitoreo en vivo (heartbeat.ts) — así panel-operador puede mostrar
 * Corte mensual/Estadísticas sin que nadie tenga que ir a la caseta.
 * Reutiliza el interruptor `habilitado` de monitoreo (no uno aparte):
 * es la misma idea, ver el negocio desde el portal.
 *
 * Se llama después de cada corte de turno (cortes:hacer, en ipc.ts) y una
 * vez al abrir la app (index.ts) — no en cada latido del heartbeat, porque
 * un estado de resultados mensual no cambia segundo a segundo y recalcular
 * 13 meses en cada latido sería trabajo de sobra.
 *
 * Nunca lanza: un fallo de red no debe tumbar el corte de caja que lo
 * disparó, ni el arranque de la app.
 */
export async function sincronizarEstadisticas(db: DB, estacionamientoId: number): Promise<void> {
  const config = obtenerConfiguracionMonitoreo(db, estacionamientoId)
  if (!config || !config.habilitado) return

  try {
    const meses = obtenerIngresosPorMes(db, estacionamientoId)
    await parchearDocumento(config, `estacionamientos/${config.slug}`, {
      estadisticasMensuales: codificarValorFirestore(
        meses.map((m) => ({
          anio: m.anio,
          mes: m.mes,
          ingresos: m.ingresos,
          egresos: m.egresos,
          resultadoNeto: m.resultadoNeto
        }))
      ),
      estadisticasActualizadasEn: { timestampValue: new Date().toISOString() }
    })
  } catch (error) {
    console.error('[estadisticas] no se pudo sincronizar con Firestore:', error)
  }
}

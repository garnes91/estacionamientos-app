import type { DB } from './index'
import { listarSeries } from './series'

interface EstadoRow {
  activo: number
  series_respaldo: string | null
}

export function obtenerModoSoloSerieA(db: DB, estacionamientoId: number): boolean {
  const fila = db
    .prepare<[number], EstadoRow>('SELECT activo, series_respaldo FROM estado_solo_serie_a WHERE estacionamiento_id = ?')
    .get(estacionamientoId)
  return fila?.activo === 1
}

/**
 * Prende/apaga el modo "solo serie A": al prenderlo, guarda cuáles series
 * estaban activas y desactiva todas menos A; al apagarlo, restaura
 * exactamente esas series (no reactiva todo a ciegas, por si alguna ya
 * estaba desactivada de antes por otra razón). Pensado para cualquier
 * usuario logueado, no solo admin — es un atajo operativo, no de
 * configuración.
 */
export function alternarModoSoloSerieA(db: DB, estacionamientoId: number): boolean {
  const transaccion = db.transaction((): boolean => {
    const estadoActual = obtenerModoSoloSerieA(db, estacionamientoId)
    const series = listarSeries(db, estacionamientoId)

    const actualizarActivo = db.prepare('UPDATE series_folio SET activo = ? WHERE id = ?')

    if (!estadoActual) {
      const serieA = series.find((s) => s.serie === 'A')
      if (!serieA) {
        throw new Error('No existe una serie "A" en este estacionamiento')
      }

      const activasAntes = series.filter((s) => s.activo).map((s) => s.id)
      for (const s of series) {
        const debeEstarActiva = s.serie === 'A'
        if (s.activo !== debeEstarActiva) actualizarActivo.run(debeEstarActiva ? 1 : 0, s.id)
      }

      db.prepare(
        `INSERT INTO estado_solo_serie_a (estacionamiento_id, activo, series_respaldo)
         VALUES (?, 1, ?)
         ON CONFLICT(estacionamiento_id) DO UPDATE SET activo = 1, series_respaldo = excluded.series_respaldo`
      ).run(estacionamientoId, JSON.stringify(activasAntes))

      return true
    }

    const fila = db
      .prepare<[number], EstadoRow>('SELECT activo, series_respaldo FROM estado_solo_serie_a WHERE estacionamiento_id = ?')
      .get(estacionamientoId)!
    const activasAntes: number[] = fila.series_respaldo ? JSON.parse(fila.series_respaldo) : []

    for (const s of series) {
      const debeEstarActiva = activasAntes.includes(s.id)
      if (s.activo !== debeEstarActiva) actualizarActivo.run(debeEstarActiva ? 1 : 0, s.id)
    }

    db.prepare('UPDATE estado_solo_serie_a SET activo = 0, series_respaldo = NULL WHERE estacionamiento_id = ?').run(
      estacionamientoId
    )

    return false
  })

  return transaccion()
}

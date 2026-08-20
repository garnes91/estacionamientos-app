import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { actualizarSerie, asignarSiguienteFolio, crearSerie, listarSeries } from './series'
import { alternarModoSoloSerieA, obtenerModoSoloSerieA } from './modoSoloSerieA'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
})

describe('alternarModoSoloSerieA', () => {
  it('desactiva todas las series salvo A al prenderlo', () => {
    const encendido = alternarModoSoloSerieA(db, estacionamientoId)
    expect(encendido).toBe(true)
    expect(obtenerModoSoloSerieA(db, estacionamientoId)).toBe(true)

    const series = listarSeries(db, estacionamientoId)
    expect(series.find((s) => s.serie === 'A')!.activo).toBe(true)
    expect(series.filter((s) => s.serie !== 'A').every((s) => !s.activo)).toBe(true)
  })

  it('solo asigna folios de la serie A mientras el modo está activo', () => {
    alternarModoSoloSerieA(db, estacionamientoId)
    const asignados = Array.from({ length: 5 }, () => asignarSiguienteFolio(db, estacionamientoId))
    expect(asignados.every((a) => a.serie === 'A')).toBe(true)
  })

  it('restaura exactamente las series que estaban activas antes al apagarlo', () => {
    alternarModoSoloSerieA(db, estacionamientoId)
    const apagado = alternarModoSoloSerieA(db, estacionamientoId)
    expect(apagado).toBe(false)
    expect(obtenerModoSoloSerieA(db, estacionamientoId)).toBe(false)

    const series = listarSeries(db, estacionamientoId)
    expect(series.every((s) => s.activo)).toBe(true)
  })

  it('al restaurar, no reactiva una serie que ya estaba desactivada antes de entrar al modo', () => {
    const serieB = listarSeries(db, estacionamientoId).find((s) => s.serie === 'B')!
    actualizarSerie(db, { id: serieB.id, proporcion: serieB.proporcion, activo: false })

    alternarModoSoloSerieA(db, estacionamientoId)
    alternarModoSoloSerieA(db, estacionamientoId)

    const series = listarSeries(db, estacionamientoId)
    expect(series.find((s) => s.serie === 'B')!.activo).toBe(false)
    expect(series.find((s) => s.serie === 'A')!.activo).toBe(true)
  })

  it('lanza error si no existe una serie "A"', () => {
    const serieA = listarSeries(db, estacionamientoId).find((s) => s.serie === 'A')!
    // Simula que la única serie disponible no se llama "A".
    db.prepare('UPDATE series_folio SET serie = ? WHERE id = ?').run('C', serieA.id)

    expect(() => alternarModoSoloSerieA(db, estacionamientoId)).toThrow('No existe una serie "A"')
  })

  it('incluye una serie creada después de haber estado en modo normal', () => {
    crearSerie(db, { estacionamientoId, serie: 'C', proporcion: 1 })
    alternarModoSoloSerieA(db, estacionamientoId)
    alternarModoSoloSerieA(db, estacionamientoId)

    const series = listarSeries(db, estacionamientoId)
    expect(series.find((s) => s.serie === 'C')!.activo).toBe(true)
  })
})

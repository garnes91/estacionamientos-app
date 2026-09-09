import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from '../db'
import { sembrarSiVacio } from '../db/seed'
import {
  exportarRespaldo,
  listarRespaldosAutomaticos,
  nombreRespaldoDelDia,
  respaldarSiHaceFalta,
  respaldosAEliminar
} from './respaldos'

describe('respaldosAEliminar', () => {
  it('conserva los N más recientes y marca el resto para borrar', () => {
    const nombres = [
      'estacionamientos-2026-09-01.db',
      'estacionamientos-2026-09-02.db',
      'estacionamientos-2026-09-03.db',
      'estacionamientos-2026-09-04.db'
    ]
    expect(respaldosAEliminar(nombres, 2)).toEqual(['estacionamientos-2026-09-01.db', 'estacionamientos-2026-09-02.db'])
  })

  it('no borra nada si hay menos archivos que el límite a conservar', () => {
    const nombres = ['estacionamientos-2026-09-01.db', 'estacionamientos-2026-09-02.db']
    expect(respaldosAEliminar(nombres, 14)).toEqual([])
  })

  it('ignora archivos que no son respaldos propios (otros archivos sueltos en la carpeta)', () => {
    const nombres = ['estacionamientos-2026-09-01.db', 'notas.txt', 'estacionamientos-2026-09-02.db.tmp']
    expect(respaldosAEliminar(nombres, 0)).toEqual(['estacionamientos-2026-09-01.db'])
  })
})

describe('nombreRespaldoDelDia', () => {
  it('usa la fecha en formato ISO (YYYY-MM-DD)', () => {
    expect(nombreRespaldoDelDia(new Date('2026-09-09T15:30:00.000Z'))).toBe('estacionamientos-2026-09-09.db')
  })
})

describe('respaldarSiHaceFalta / listarRespaldosAutomaticos / exportarRespaldo', () => {
  let db: DB
  let carpetaTemporal: string

  beforeEach(() => {
    db = abrirDb(':memory:')
    sembrarSiVacio(db)
    carpetaTemporal = mkdtempSync(join(tmpdir(), 'estacionamientos-respaldos-test-'))
  })

  afterEach(() => {
    db.close()
    rmSync(carpetaTemporal, { recursive: true, force: true })
  })

  it('crea el respaldo del día en una carpeta "respaldos" nueva', async () => {
    await respaldarSiHaceFalta(db, carpetaTemporal, new Date('2026-09-09T12:00:00.000Z'))
    const carpeta = join(carpetaTemporal, 'respaldos')
    expect(existsSync(join(carpeta, 'estacionamientos-2026-09-09.db'))).toBe(true)
  })

  it('no vuelve a respaldar si ya existe el de hoy (no truena, simplemente no hace nada)', async () => {
    const fecha = new Date('2026-09-09T12:00:00.000Z')
    await respaldarSiHaceFalta(db, carpetaTemporal, fecha)
    await respaldarSiHaceFalta(db, carpetaTemporal, fecha)
    const archivos = readdirSync(join(carpetaTemporal, 'respaldos'))
    expect(archivos).toEqual(['estacionamientos-2026-09-09.db'])
  })

  it('respalda un día distinto como archivo aparte', async () => {
    await respaldarSiHaceFalta(db, carpetaTemporal, new Date('2026-09-08T12:00:00.000Z'))
    await respaldarSiHaceFalta(db, carpetaTemporal, new Date('2026-09-09T12:00:00.000Z'))
    const archivos = readdirSync(join(carpetaTemporal, 'respaldos')).sort()
    expect(archivos).toEqual(['estacionamientos-2026-09-08.db', 'estacionamientos-2026-09-09.db'])
  })

  it('listarRespaldosAutomaticos trae los respaldos existentes, más reciente primero', async () => {
    await respaldarSiHaceFalta(db, carpetaTemporal, new Date('2026-09-08T12:00:00.000Z'))
    await respaldarSiHaceFalta(db, carpetaTemporal, new Date('2026-09-09T12:00:00.000Z'))
    const lista = listarRespaldosAutomaticos(carpetaTemporal)
    expect(lista.map((r) => r.archivo)).toEqual(['estacionamientos-2026-09-09.db', 'estacionamientos-2026-09-08.db'])
    expect(lista[0].tamanoBytes).toBeGreaterThan(0)
  })

  it('exportarRespaldo copia la base a la ruta exacta que se le pase, y esa copia se puede volver a abrir', async () => {
    const destino = join(carpetaTemporal, 'mi-respaldo-manual.db')
    await exportarRespaldo(db, destino)
    expect(existsSync(destino)).toBe(true)

    const copia = abrirDb(destino)
    const { id } = copia.prepare('SELECT id FROM estacionamientos LIMIT 1').get() as { id: number }
    expect(id).toBeGreaterThan(0)
    copia.close()
  })
})

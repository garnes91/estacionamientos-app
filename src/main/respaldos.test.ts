import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from '../db'
import { sembrarSiVacio } from '../db/seed'
import { actualizarNombreEstacionamiento, obtenerEstacionamientoActual } from '../db/estacionamientos'
import {
  exportarRespaldo,
  listarRespaldosAutomaticos,
  nombreRespaldoDelDia,
  respaldarSiHaceFalta,
  respaldoDeSeguridad,
  respaldosAEliminar,
  restaurarDesdeArchivo,
  validarArchivoDeRespaldo
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

describe('validarArchivoDeRespaldo', () => {
  let carpetaTemporal: string

  beforeEach(() => {
    carpetaTemporal = mkdtempSync(join(tmpdir(), 'estacionamientos-respaldos-test-'))
  })

  afterEach(() => {
    rmSync(carpetaTemporal, { recursive: true, force: true })
  })

  it('no truena con un respaldo real (tiene al menos un estacionamiento)', async () => {
    const db = abrirDb(':memory:')
    sembrarSiVacio(db)
    const ruta = join(carpetaTemporal, 'valido.db')
    await db.backup(ruta)
    db.close()

    expect(() => validarArchivoDeRespaldo(ruta)).not.toThrow()
  })

  it('rechaza un archivo que ni siquiera es SQLite', () => {
    const ruta = join(carpetaTemporal, 'no-es-sqlite.db')
    writeFileSync(ruta, 'esto no es una base de datos')
    expect(() => validarArchivoDeRespaldo(ruta)).toThrow()
  })
})

describe('respaldoDeSeguridad', () => {
  it('crea un archivo con prefijo "antes-de-restaurar-" y devuelve su ruta', async () => {
    const db = abrirDb(':memory:')
    sembrarSiVacio(db)
    const carpetaTemporal = mkdtempSync(join(tmpdir(), 'estacionamientos-respaldos-test-'))
    try {
      const ruta = await respaldoDeSeguridad(db, carpetaTemporal, new Date('2026-09-09T15:04:05.000Z'))
      expect(ruta).toContain('antes-de-restaurar-2026-09-09')
      expect(existsSync(ruta)).toBe(true)
    } finally {
      db.close()
      rmSync(carpetaTemporal, { recursive: true, force: true })
    }
  })
})

describe('restaurarDesdeArchivo', () => {
  let carpetaTemporal: string

  beforeEach(() => {
    carpetaTemporal = mkdtempSync(join(tmpdir(), 'estacionamientos-respaldos-test-'))
  })

  afterEach(() => {
    rmSync(carpetaTemporal, { recursive: true, force: true })
  })

  it('sobrescribe rutaDb con el contenido del archivo de respaldo (no con lo que ya tenía)', async () => {
    // "Respaldo" a restaurar: un estacionamiento llamado "Del respaldo".
    const origen = abrirDb(':memory:')
    sembrarSiVacio(origen)
    actualizarNombreEstacionamiento(origen, obtenerEstacionamientoActual(origen).id, 'Del respaldo')
    const rutaOrigen = join(carpetaTemporal, 'respaldo-a-restaurar.db')
    await origen.backup(rutaOrigen)
    origen.close()

    // "Base viva" actual: un estacionamiento con OTRO nombre — esto es lo
    // que debe desaparecer después de restaurar.
    const rutaDb = join(carpetaTemporal, 'estacionamientos.db')
    const viva = abrirDb(rutaDb)
    sembrarSiVacio(viva)
    actualizarNombreEstacionamiento(viva, obtenerEstacionamientoActual(viva).id, 'Base viva (antes de restaurar)')
    viva.close()

    await restaurarDesdeArchivo(rutaOrigen, rutaDb)

    const resultado = abrirDb(rutaDb)
    expect(obtenerEstacionamientoActual(resultado).nombre).toBe('Del respaldo')
    resultado.close()
  })

  it('limpia archivos -wal/-shm/-journal sueltos de la base viva antes de sobrescribir', async () => {
    const origen = abrirDb(':memory:')
    sembrarSiVacio(origen)
    const rutaOrigen = join(carpetaTemporal, 'respaldo-a-restaurar.db')
    await origen.backup(rutaOrigen)
    origen.close()

    const rutaDb = join(carpetaTemporal, 'estacionamientos.db')
    writeFileSync(rutaDb, '')
    writeFileSync(`${rutaDb}-wal`, 'basura de una sesión anterior')
    writeFileSync(`${rutaDb}-shm`, 'basura de una sesión anterior')

    await restaurarDesdeArchivo(rutaOrigen, rutaDb)

    expect(existsSync(`${rutaDb}-wal`)).toBe(false)
    expect(existsSync(`${rutaDb}-shm`)).toBe(false)
  })
})

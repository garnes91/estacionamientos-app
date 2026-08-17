import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import {
  actualizarSerie,
  asignarSiguienteFolio,
  crearSerie,
  eliminarSerie,
  establecerSiguienteNumero,
  listarSeries
} from './series'

let db: DB
let estacionamientoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  estacionamientoId = db
    .prepare('INSERT INTO estacionamientos (nombre) VALUES (?)')
    .run('Estacionamiento de prueba').lastInsertRowid as number

  db.prepare('INSERT INTO series_folio (estacionamiento_id, serie, proporcion) VALUES (?,?,?)').run(
    estacionamientoId,
    'A',
    3
  )
  db.prepare('INSERT INTO series_folio (estacionamiento_id, serie, proporcion) VALUES (?,?,?)').run(
    estacionamientoId,
    'B',
    1
  )
})

describe('asignarSiguienteFolio', () => {
  it('asigna folios consecutivos por serie y respeta la proporción 3:1', () => {
    const asignados = Array.from({ length: 8 }, () => asignarSiguienteFolio(db, estacionamientoId))

    const deA = asignados.filter((a) => a.serie === 'A')
    const deB = asignados.filter((a) => a.serie === 'B')

    expect(deA.length).toBe(6)
    expect(deB.length).toBe(2)
    expect(deA.map((a) => a.folio)).toEqual([1, 2, 3, 4, 5, 6])
    expect(deB.map((a) => a.folio)).toEqual([1, 2])
  })

  it('persiste el avance de los contadores en series_folio', () => {
    for (let i = 0; i < 4; i++) asignarSiguienteFolio(db, estacionamientoId)

    const filas = db
      .prepare('SELECT serie, siguiente_numero, contador_emitidos FROM series_folio ORDER BY serie')
      .all() as { serie: string; siguiente_numero: number; contador_emitidos: number }[]

    const totalEmitido = filas.reduce((acc, f) => acc + f.contador_emitidos, 0)
    expect(totalEmitido).toBe(4)
  })

  it('ignora series inactivas de otros estacionamientos', () => {
    const otroEstId = db
      .prepare('INSERT INTO estacionamientos (nombre) VALUES (?)')
      .run('Otro estacionamiento').lastInsertRowid as number
    db.prepare('INSERT INTO series_folio (estacionamiento_id, serie, proporcion) VALUES (?,?,?)').run(
      otroEstId,
      'A',
      1
    )

    // El folio del otro estacionamiento no debe interferir con este.
    const asignado = asignarSiguienteFolio(db, estacionamientoId)
    expect(['A', 'B']).toContain(asignado.serie)

    const filaOtro = db
      .prepare('SELECT contador_emitidos FROM series_folio WHERE estacionamiento_id = ?')
      .get(otroEstId) as { contador_emitidos: number }
    expect(filaOtro.contador_emitidos).toBe(0)
  })

  it('lanza error si el estacionamiento no tiene series activas', () => {
    const sinSeriesId = db
      .prepare('INSERT INTO estacionamientos (nombre) VALUES (?)')
      .run('Sin series').lastInsertRowid as number

    expect(() => asignarSiguienteFolio(db, sinSeriesId)).toThrow('No hay series de folio activas')
  })
})

describe('listarSeries / actualizarSerie / crearSerie (admin)', () => {
  it('listarSeries incluye ambas series con su proporción', () => {
    const series = listarSeries(db, estacionamientoId)
    expect(series.map((s) => ({ serie: s.serie, proporcion: s.proporcion }))).toEqual([
      { serie: 'A', proporcion: 3 },
      { serie: 'B', proporcion: 1 }
    ])
  })

  it('actualizarSerie cambia la proporción y se refleja en el reparto', () => {
    const serieB = listarSeries(db, estacionamientoId).find((s) => s.serie === 'B')!
    actualizarSerie(db, { id: serieB.id, proporcion: 3, activo: true }) // ahora 3:3 = 1:1

    const asignados = Array.from({ length: 4 }, () => asignarSiguienteFolio(db, estacionamientoId))
    expect(asignados.filter((a) => a.serie === 'A')).toHaveLength(2)
    expect(asignados.filter((a) => a.serie === 'B')).toHaveLength(2)
  })

  it('desactivar una serie hace que ya no se le asignen folios', () => {
    const serieB = listarSeries(db, estacionamientoId).find((s) => s.serie === 'B')!
    actualizarSerie(db, { id: serieB.id, proporcion: serieB.proporcion, activo: false })

    const asignados = Array.from({ length: 5 }, () => asignarSiguienteFolio(db, estacionamientoId))
    expect(asignados.every((a) => a.serie === 'A')).toBe(true)
  })

  it('crearSerie agrega una serie nueva utilizable de inmediato', () => {
    crearSerie(db, { estacionamientoId, serie: 'c', proporcion: 1 })
    expect(listarSeries(db, estacionamientoId).map((s) => s.serie)).toContain('C')
  })

  it('rechaza símbolos y otros caracteres que Code128 no puede imprimir (ej. "A°")', () => {
    expect(() => crearSerie(db, { estacionamientoId, serie: 'A°', proporcion: 1 })).toThrow(
      'La serie debe ser de 1 a 3 letras'
    )
  })

  it('rechaza números, espacios y series vacías', () => {
    expect(() => crearSerie(db, { estacionamientoId, serie: 'A1', proporcion: 1 })).toThrow()
    expect(() => crearSerie(db, { estacionamientoId, serie: 'A B', proporcion: 1 })).toThrow()
    expect(() => crearSerie(db, { estacionamientoId, serie: '', proporcion: 1 })).toThrow()
    expect(() => crearSerie(db, { estacionamientoId, serie: 'ABCD', proporcion: 1 })).toThrow()
  })

  it('eliminarSerie la quita del listado y del reparto', () => {
    const serieB = listarSeries(db, estacionamientoId).find((s) => s.serie === 'B')!
    eliminarSerie(db, serieB.id)

    expect(listarSeries(db, estacionamientoId).map((s) => s.serie)).toEqual(['A'])

    const asignados = Array.from({ length: 5 }, () => asignarSiguienteFolio(db, estacionamientoId))
    expect(asignados.every((a) => a.serie === 'A')).toBe(true)
  })

  it('eliminar una serie no borra ni rompe los boletos ya emitidos con esa letra', () => {
    const asignado = asignarSiguienteFolio(db, estacionamientoId) // primero: serie A
    const serieA = listarSeries(db, estacionamientoId).find((s) => s.serie === 'A')!

    const tipoId = db
      .prepare('INSERT INTO tipos_vehiculo (estacionamiento_id, nombre) VALUES (?, ?)')
      .run(estacionamientoId, 'Auto').lastInsertRowid as number
    const usuarioId = db
      .prepare(
        'INSERT INTO usuarios (estacionamiento_id, nombre_usuario, password_hash, nombre_completo, rol) VALUES (?,?,?,?,?)'
      )
      .run(estacionamientoId, 'empleado', 'x', 'Empleado', 'empleado').lastInsertRowid as number
    const tarifaId = db
      .prepare('INSERT INTO tarifas_progresivas (estacionamiento_id, tipo_vehiculo_id, vigente_desde) VALUES (?,?,?)')
      .run(estacionamientoId, tipoId, new Date().toISOString()).lastInsertRowid as number

    db.prepare(
      `INSERT INTO boletos (estacionamiento_id, serie, folio, tipo_vehiculo_id, tarifa_progresiva_id, hora_entrada, usuario_emision_id)
       VALUES (?,?,?,?,?,?,?)`
    ).run(estacionamientoId, asignado.serie, asignado.folio, tipoId, tarifaId, new Date().toISOString(), usuarioId)

    eliminarSerie(db, serieA.id)

    const boleto = db.prepare('SELECT serie, folio FROM boletos WHERE estacionamiento_id = ?').get(estacionamientoId) as {
      serie: string
      folio: number
    }
    expect(boleto).toEqual({ serie: asignado.serie, folio: asignado.folio })
  })

  it('recrear una serie borrada continúa después del folio más alto ya usado con esa letra (no reinicia en 1)', () => {
    const tipoId = db
      .prepare('INSERT INTO tipos_vehiculo (estacionamiento_id, nombre) VALUES (?, ?)')
      .run(estacionamientoId, 'Auto').lastInsertRowid as number
    const usuarioId = db
      .prepare(
        'INSERT INTO usuarios (estacionamiento_id, nombre_usuario, password_hash, nombre_completo, rol) VALUES (?,?,?,?,?)'
      )
      .run(estacionamientoId, 'empleado', 'x', 'Empleado', 'empleado').lastInsertRowid as number
    const tarifaId = db
      .prepare('INSERT INTO tarifas_progresivas (estacionamiento_id, tipo_vehiculo_id, vigente_desde) VALUES (?,?,?)')
      .run(estacionamientoId, tipoId, new Date().toISOString()).lastInsertRowid as number

    // Serie A ya trae folios 1..40 emitidos (simula uso real antes de borrarla).
    const insertarBoleto = db.prepare(
      `INSERT INTO boletos (estacionamiento_id, serie, folio, tipo_vehiculo_id, tarifa_progresiva_id, hora_entrada, usuario_emision_id, estado)
       VALUES (?,'A',?,?,?,?,?,'cerrado')`
    )
    for (let folio = 1; folio <= 40; folio++) {
      insertarBoleto.run(estacionamientoId, folio, tipoId, tarifaId, new Date().toISOString(), usuarioId)
    }

    const serieA = listarSeries(db, estacionamientoId).find((s) => s.serie === 'A')!
    eliminarSerie(db, serieA.id)

    const recreada = crearSerie(db, { estacionamientoId, serie: 'A', proporcion: 1 })
    expect(recreada.siguienteNumero).toBe(41)

    // Y de verdad se puede asignar sin chocar contra el UNIQUE de boletos.
    const asignado = asignarSiguienteFolio(db, estacionamientoId)
    expect(asignado).toEqual({ serie: 'A', folio: 41 })
  })

  describe('establecerSiguienteNumero', () => {
    it('reestablece el próximo folio para empatar con un sistema anterior', () => {
      const serieA = listarSeries(db, estacionamientoId).find((s) => s.serie === 'A')!
      const serieB = listarSeries(db, estacionamientoId).find((s) => s.serie === 'B')!
      establecerSiguienteNumero(db, serieA.id, 1500)
      actualizarSerie(db, { id: serieB.id, proporcion: serieB.proporcion, activo: false })

      expect(listarSeries(db, estacionamientoId).find((s) => s.serie === 'A')!.siguienteNumero).toBe(1500)
      expect(asignarSiguienteFolio(db, estacionamientoId)).toEqual({ serie: 'A', folio: 1500 })
    })

    it('rechaza números menores a 1 o no enteros', () => {
      const serieA = listarSeries(db, estacionamientoId).find((s) => s.serie === 'A')!
      expect(() => establecerSiguienteNumero(db, serieA.id, 0)).toThrow('mayor o igual a 1')
      expect(() => establecerSiguienteNumero(db, serieA.id, 1.5)).toThrow('mayor o igual a 1')
    })

    it('rechaza bajar el número por debajo de un folio ya usado en esa serie', () => {
      const tipoId = db
        .prepare('INSERT INTO tipos_vehiculo (estacionamiento_id, nombre) VALUES (?, ?)')
        .run(estacionamientoId, 'Auto').lastInsertRowid as number
      const usuarioId = db
        .prepare(
          'INSERT INTO usuarios (estacionamiento_id, nombre_usuario, password_hash, nombre_completo, rol) VALUES (?,?,?,?,?)'
        )
        .run(estacionamientoId, 'empleado', 'x', 'Empleado', 'empleado').lastInsertRowid as number
      const tarifaId = db
        .prepare('INSERT INTO tarifas_progresivas (estacionamiento_id, tipo_vehiculo_id, vigente_desde) VALUES (?,?,?)')
        .run(estacionamientoId, tipoId, new Date().toISOString()).lastInsertRowid as number

      db.prepare(
        `INSERT INTO boletos (estacionamiento_id, serie, folio, tipo_vehiculo_id, tarifa_progresiva_id, hora_entrada, usuario_emision_id, estado)
         VALUES (?,'A',10,?,?,?,?,'cerrado')`
      ).run(estacionamientoId, tipoId, tarifaId, new Date().toISOString(), usuarioId)

      const serieA = listarSeries(db, estacionamientoId).find((s) => s.serie === 'A')!
      expect(() => establecerSiguienteNumero(db, serieA.id, 5)).toThrow('Ya existe un boleto con folio 10')
    })

    it('lanza error si la serie no existe', () => {
      expect(() => establecerSiguienteNumero(db, 999999, 10)).toThrow('No existe esa serie')
    })
  })
})

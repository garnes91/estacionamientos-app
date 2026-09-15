import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { DB } from './index'
import { agregarColumnaSiFalta, ampliarRolUsuariosSiHaceFalta, backfillMarcadoresSiFalta, quitarColumnaSiExiste } from './migraciones'
import { MARCADORES_DISPONIBLES } from '../logic/folioBarcode'

describe('agregarColumnaSiFalta', () => {
  it('agrega la columna a una tabla existente que no la tiene', () => {
    const db: DB = new Database(':memory:')
    db.exec("CREATE TABLE ejemplo (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL DEFAULT '')")
    db.exec("INSERT INTO ejemplo (id, nombre) VALUES (1, 'algo')")

    agregarColumnaSiFalta(db, 'ejemplo', 'nueva', "nueva INTEGER NOT NULL DEFAULT 0 CHECK (nueva IN (0, 1))")

    const columnas = (db.prepare('PRAGMA table_info(ejemplo)').all() as { name: string }[]).map((c) => c.name)
    expect(columnas).toContain('nueva')

    const fila = db.prepare('SELECT nueva FROM ejemplo WHERE id = 1').get()
    expect(fila).toEqual({ nueva: 0 })
  })

  it('no falla si la tabla todavía no existe (instalación nueva — schema.sql la crea completa)', () => {
    const db: DB = new Database(':memory:')
    expect(() => agregarColumnaSiFalta(db, 'no_existe', 'columna', 'columna TEXT')).not.toThrow()
  })

  it('es idempotente: correrla dos veces seguidas no falla ni duplica columnas', () => {
    const db: DB = new Database(':memory:')
    db.exec('CREATE TABLE ejemplo (id INTEGER PRIMARY KEY)')

    agregarColumnaSiFalta(db, 'ejemplo', 'nueva', 'nueva TEXT')
    expect(() => agregarColumnaSiFalta(db, 'ejemplo', 'nueva', 'nueva TEXT')).not.toThrow()

    const columnas = (db.prepare('PRAGMA table_info(ejemplo)').all() as { name: string }[]).map((c) => c.name)
    expect(columnas.filter((c) => c === 'nueva')).toHaveLength(1)
  })

  it('no toca una tabla que ya tiene la columna (instalación ya migrada)', () => {
    const db: DB = new Database(':memory:')
    db.exec("CREATE TABLE ejemplo (id INTEGER PRIMARY KEY, nueva TEXT)")
    db.exec("INSERT INTO ejemplo (id, nueva) VALUES (1, 'valor-existente')")

    agregarColumnaSiFalta(db, 'ejemplo', 'nueva', 'nueva TEXT')

    const fila = db.prepare('SELECT nueva FROM ejemplo WHERE id = 1').get()
    expect(fila).toEqual({ nueva: 'valor-existente' })
  })
})

describe('quitarColumnaSiExiste', () => {
  it('quita la columna de una tabla que la tiene', () => {
    const db: DB = new Database(':memory:')
    db.exec("CREATE TABLE ejemplo (id INTEGER PRIMARY KEY, sobra TEXT NOT NULL DEFAULT '', queda TEXT)")
    db.exec("INSERT INTO ejemplo (id, sobra, queda) VALUES (1, 'x', 'y')")

    quitarColumnaSiExiste(db, 'ejemplo', 'sobra')

    const columnas = (db.prepare('PRAGMA table_info(ejemplo)').all() as { name: string }[]).map((c) => c.name)
    expect(columnas).toEqual(['id', 'queda'])
    expect(db.prepare('SELECT queda FROM ejemplo WHERE id = 1').get()).toEqual({ queda: 'y' })
  })

  it('no truena si la tabla todavía no existe (instalación nueva)', () => {
    const db: DB = new Database(':memory:')
    expect(() => quitarColumnaSiExiste(db, 'no_existe', 'columna')).not.toThrow()
  })

  it('es idempotente: correrla dos veces seguidas no falla', () => {
    const db: DB = new Database(':memory:')
    db.exec('CREATE TABLE ejemplo (id INTEGER PRIMARY KEY, sobra TEXT)')

    quitarColumnaSiExiste(db, 'ejemplo', 'sobra')
    expect(() => quitarColumnaSiExiste(db, 'ejemplo', 'sobra')).not.toThrow()
  })

  it('no permite un INSERT nuevo violar un NOT NULL de la columna que ya no está (simula la migración real)', () => {
    const db: DB = new Database(':memory:')
    db.exec("CREATE TABLE ejemplo (id INTEGER PRIMARY KEY, sobra TEXT NOT NULL, queda TEXT)")

    quitarColumnaSiExiste(db, 'ejemplo', 'sobra')

    expect(() => db.prepare('INSERT INTO ejemplo (id, queda) VALUES (1, ?)').run('ok')).not.toThrow()
  })
})

describe('ampliarRolUsuariosSiHaceFalta', () => {
  /** Simula una instalación real de antes de este cambio: esquema viejo (CHECK sin 'supervisor') más una tabla hija con FK a usuarios(id), como boletos/cortes/gastos en la app real. */
  function crearBaseConEsquemaViejo(): DB {
    const db: DB = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TABLE estacionamientos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
      CREATE TABLE usuarios (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
        nombre_usuario      TEXT NOT NULL,
        password_hash       TEXT NOT NULL,
        nombre_completo     TEXT NOT NULL,
        rol                 TEXT NOT NULL CHECK (rol IN ('admin', 'empleado')),
        activo              INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (estacionamiento_id, nombre_usuario)
      );
      CREATE TABLE gastos_de_prueba (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
        concepto    TEXT NOT NULL
      );
    `)
    db.exec("INSERT INTO estacionamientos (id, nombre) VALUES (1, 'Centro')")
    db.exec(
      "INSERT INTO usuarios (id, estacionamiento_id, nombre_usuario, password_hash, nombre_completo, rol) VALUES (1, 1, 'ana', 'hash', 'Ana Admin', 'admin')"
    )
    db.exec(
      "INSERT INTO usuarios (id, estacionamiento_id, nombre_usuario, password_hash, nombre_completo, rol) VALUES (2, 1, 'beto', 'hash', 'Beto Empleado', 'empleado')"
    )
    db.exec("INSERT INTO gastos_de_prueba (usuario_id, concepto) VALUES (2, 'Escoba')")
    return db
  }

  it('no truena si la tabla usuarios todavía no existe (instalación nueva)', () => {
    const db: DB = new Database(':memory:')
    expect(() => ampliarRolUsuariosSiHaceFalta(db)).not.toThrow()
  })

  it('permite insertar rol supervisor después de migrar (antes lo rechazaba el CHECK)', () => {
    const db = crearBaseConEsquemaViejo()

    expect(() =>
      db
        .prepare(
          "INSERT INTO usuarios (estacionamiento_id, nombre_usuario, password_hash, nombre_completo, rol) VALUES (1, 'cata', 'hash', 'Cata Supervisora', 'supervisor')"
        )
        .run()
    ).toThrow()

    ampliarRolUsuariosSiHaceFalta(db)

    expect(() =>
      db
        .prepare(
          "INSERT INTO usuarios (estacionamiento_id, nombre_usuario, password_hash, nombre_completo, rol) VALUES (1, 'cata', 'hash', 'Cata Supervisora', 'supervisor')"
        )
        .run()
    ).not.toThrow()
  })

  it('conserva los usuarios existentes con sus mismos ids', () => {
    const db = crearBaseConEsquemaViejo()
    ampliarRolUsuariosSiHaceFalta(db)

    const filas = db.prepare('SELECT id, nombre_usuario, rol FROM usuarios ORDER BY id').all()
    expect(filas).toEqual([
      { id: 1, nombre_usuario: 'ana', rol: 'admin' },
      { id: 2, nombre_usuario: 'beto', rol: 'empleado' }
    ])
  })

  it('no rompe las referencias de tablas hijas (foreign_key_check limpio, el join sigue funcionando)', () => {
    const db = crearBaseConEsquemaViejo()
    ampliarRolUsuariosSiHaceFalta(db)

    const violaciones = db.pragma('foreign_key_check')
    expect(violaciones).toEqual([])

    const fila = db
      .prepare(
        `SELECT g.concepto, u.nombre_usuario
         FROM gastos_de_prueba g JOIN usuarios u ON u.id = g.usuario_id
         WHERE g.concepto = 'Escoba'`
      )
      .get()
    expect(fila).toEqual({ concepto: 'Escoba', nombre_usuario: 'beto' })
  })

  it('deja foreign_keys en ON al terminar', () => {
    const db = crearBaseConEsquemaViejo()
    ampliarRolUsuariosSiHaceFalta(db)
    expect((db.pragma('foreign_keys') as { foreign_keys: number }[])[0].foreign_keys).toBe(1)
  })

  it('es idempotente: correrla de nuevo sobre una base ya migrada no truena ni duplica usuarios', () => {
    const db = crearBaseConEsquemaViejo()
    ampliarRolUsuariosSiHaceFalta(db)
    expect(() => ampliarRolUsuariosSiHaceFalta(db)).not.toThrow()

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }
    expect(n).toBe(2)
  })
})

describe('backfillMarcadoresSiFalta', () => {
  function crearBaseConSeries(filas: { id: number; estacionamientoId: number; serie: string; marcador: string | null }[]): DB {
    const db: DB = new Database(':memory:')
    db.exec(`
      CREATE TABLE estacionamientos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
      CREATE TABLE series_folio (
        id                  INTEGER PRIMARY KEY,
        estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
        serie               TEXT NOT NULL,
        marcador            TEXT,
        proporcion          INTEGER NOT NULL DEFAULT 1,
        siguiente_numero    INTEGER NOT NULL DEFAULT 1,
        contador_emitidos   INTEGER NOT NULL DEFAULT 0,
        activo              INTEGER NOT NULL DEFAULT 1
      );
    `)
    const insertarEst = db.prepare('INSERT OR IGNORE INTO estacionamientos (id, nombre) VALUES (?, ?)')
    const insertarSerie = db.prepare('INSERT INTO series_folio (id, estacionamiento_id, serie, marcador) VALUES (?,?,?,?)')
    for (const f of filas) {
      insertarEst.run(f.estacionamientoId, `Estacionamiento ${f.estacionamientoId}`)
      insertarSerie.run(f.id, f.estacionamientoId, f.serie, f.marcador)
    }
    return db
  }

  it('no truena si la tabla series_folio todavía no existe (instalación nueva)', () => {
    const db: DB = new Database(':memory:')
    expect(() => backfillMarcadoresSiFalta(db)).not.toThrow()
  })

  it('asigna un marcador único del pool a las series que no tienen', () => {
    const db = crearBaseConSeries([
      { id: 1, estacionamientoId: 1, serie: 'A', marcador: null },
      { id: 2, estacionamientoId: 1, serie: 'B', marcador: null }
    ])

    backfillMarcadoresSiFalta(db)

    const filas = db.prepare('SELECT serie, marcador FROM series_folio ORDER BY serie').all() as {
      serie: string
      marcador: string
    }[]
    expect(filas.every((f) => MARCADORES_DISPONIBLES.includes(f.marcador))).toBe(true)
    expect(filas[0].marcador).not.toBe(filas[1].marcador)
  })

  it('no toca una serie que ya tiene marcador', () => {
    const db = crearBaseConSeries([
      { id: 1, estacionamientoId: 1, serie: 'A', marcador: '#' },
      { id: 2, estacionamientoId: 1, serie: 'B', marcador: null }
    ])

    backfillMarcadoresSiFalta(db)

    const filas = db.prepare('SELECT serie, marcador FROM series_folio ORDER BY serie').all() as {
      serie: string
      marcador: string
    }[]
    expect(filas.find((f) => f.serie === 'A')!.marcador).toBe('#')
    expect(filas.find((f) => f.serie === 'B')!.marcador).not.toBe('#')
  })

  it('asigna marcadores de forma independiente por estacionamiento (pueden repetirse entre estacionamientos distintos)', () => {
    const db = crearBaseConSeries([
      { id: 1, estacionamientoId: 1, serie: 'A', marcador: null },
      { id: 2, estacionamientoId: 2, serie: 'A', marcador: null }
    ])

    backfillMarcadoresSiFalta(db)

    const filas = db.prepare('SELECT estacionamiento_id, marcador FROM series_folio ORDER BY id').all() as {
      estacionamiento_id: number
      marcador: string
    }[]
    // Cada estacionamiento arranca del mismo pool por su cuenta — se
    // espera que ambos reciban el primer símbolo disponible (mismo valor).
    expect(filas[0].marcador).toBe(filas[1].marcador)
  })

  it('lanza un error claro si hay más series que símbolos en el pool, para un mismo estacionamiento', () => {
    const filas = MARCADORES_DISPONIBLES.map((_, i) => ({
      id: i + 1,
      estacionamientoId: 1,
      serie: String.fromCharCode(65 + i),
      marcador: null as string | null
    }))
    // Una serie de más que símbolos disponibles.
    filas.push({ id: filas.length + 1, estacionamientoId: 1, serie: 'ZZ', marcador: null })
    const db = crearBaseConSeries(filas)

    expect(() => backfillMarcadoresSiFalta(db)).toThrow('No hay suficientes marcadores disponibles')
  })

  it('es idempotente: correrla de nuevo no cambia los marcadores ya asignados', () => {
    const db = crearBaseConSeries([
      { id: 1, estacionamientoId: 1, serie: 'A', marcador: null },
      { id: 2, estacionamientoId: 1, serie: 'B', marcador: null }
    ])
    backfillMarcadoresSiFalta(db)
    const antes = db.prepare('SELECT serie, marcador FROM series_folio ORDER BY serie').all()

    expect(() => backfillMarcadoresSiFalta(db)).not.toThrow()
    const despues = db.prepare('SELECT serie, marcador FROM series_folio ORDER BY serie').all()
    expect(despues).toEqual(antes)
  })
})

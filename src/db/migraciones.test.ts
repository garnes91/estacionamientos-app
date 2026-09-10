import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { DB } from './index'
import { agregarColumnaSiFalta, ampliarRolUsuariosSiHaceFalta, quitarColumnaSiExiste } from './migraciones'

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

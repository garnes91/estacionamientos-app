import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { DB } from './index'
import { agregarColumnaSiFalta } from './migraciones'

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

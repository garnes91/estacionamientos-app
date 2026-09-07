import type { DB } from './index'

export interface Estacionamiento {
  id: number
  nombre: string
  textoBoleto: string | null
  cargoBoletoPerdido: number
  umbralRecobroSospechoso: number
}

/** Cada instalación administra un solo estacionamiento: el primero activo. */
export function obtenerEstacionamientoActual(db: DB): Estacionamiento {
  const fila = db
    .prepare(
      `SELECT id, nombre, texto_boleto AS textoBoleto, cargo_boleto_perdido AS cargoBoletoPerdido,
              umbral_recobro_sospechoso AS umbralRecobroSospechoso
       FROM estacionamientos WHERE activo = 1 ORDER BY id LIMIT 1`
    )
    .get() as Estacionamiento | undefined

  if (!fila) {
    throw new Error('No hay un estacionamiento configurado en esta instalación')
  }

  return fila
}

export function actualizarTextoBoleto(db: DB, estacionamientoId: number, texto: string | null): void {
  db.prepare('UPDATE estacionamientos SET texto_boleto = ? WHERE id = ?').run(texto, estacionamientoId)
}

/** Cargo fijo extra que se suma al cobro normal al cerrar un "boleto perdido". */
export function actualizarCargoBoletoPerdido(db: DB, estacionamientoId: number, monto: number): void {
  if (monto < 0) {
    throw new Error('El cargo por boleto perdido no puede ser negativo')
  }
  db.prepare('UPDATE estacionamientos SET cargo_boleto_perdido = ? WHERE id = ?').run(monto, estacionamientoId)
}

/** A partir de cuántos reescaneos de un boleto ya cerrado se avisa como recobro sospechoso (ver src/db/boletos.ts). */
export function actualizarUmbralRecobroSospechoso(db: DB, estacionamientoId: number, umbral: number): void {
  if (!Number.isInteger(umbral) || umbral < 1) {
    throw new Error('El umbral de recobro sospechoso debe ser un entero de al menos 1')
  }
  db.prepare('UPDATE estacionamientos SET umbral_recobro_sospechoso = ? WHERE id = ?').run(umbral, estacionamientoId)
}

/**
 * Nombre del estacionamiento — aparece en la pantalla de operación, el
 * boleto impreso, y el corte de caja (pantalla, PDF y Excel). Con varias
 * instalaciones, es lo que distingue de cuál estacionamiento es cada
 * reporte que llega por correo.
 */
export function actualizarNombreEstacionamiento(db: DB, estacionamientoId: number, nombre: string): void {
  const limpio = nombre.trim()
  if (!limpio) {
    throw new Error('El nombre del estacionamiento no puede quedar vacío')
  }
  db.prepare('UPDATE estacionamientos SET nombre = ? WHERE id = ?').run(limpio, estacionamientoId)
}

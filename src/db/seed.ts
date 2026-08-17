import type { DB } from './index'
import { hashPassword } from './passwordHash'

interface TipoVehiculoSeed {
  nombre: string
  preciosPorBloque: number[]
  tarifaMaximaDiaria: number
}

const TIPOS_SEED: TipoVehiculoSeed[] = [
  { nombre: 'Auto', preciosPorBloque: [...Array(4).fill(10), ...Array(20).fill(15)], tarifaMaximaDiaria: 300 },
  { nombre: 'Camioneta', preciosPorBloque: [...Array(4).fill(12), ...Array(20).fill(18)], tarifaMaximaDiaria: 360 },
  { nombre: 'Camión', preciosPorBloque: [...Array(4).fill(15), ...Array(20).fill(20)], tarifaMaximaDiaria: 400 }
]

/**
 * Si la base está vacía, crea el estacionamiento único de esta instalación
 * con datos mínimos de arranque (tipos de vehículo, tarifas progresivas,
 * series de folio y dos usuarios de prueba: admin/admin y empleado/empleado).
 * Cada instalación administra exactamente un estacionamiento; no hay
 * pantallas de configuración todavía, así que esto reemplaza el registro
 * manual por ahora. Cambiar estas contraseñas antes de operar en real —
 * no hay pantalla para hacerlo todavía.
 */
export function sembrarSiVacio(db: DB): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM estacionamientos').get() as { n: number }
  if (n > 0) return

  const ahora = new Date().toISOString()

  const estacionamientoId = db
    .prepare('INSERT INTO estacionamientos (nombre) VALUES (?)')
    .run('Mi Estacionamiento').lastInsertRowid as number

  const insertarUsuario = db.prepare(
    'INSERT INTO usuarios (estacionamiento_id, nombre_usuario, password_hash, nombre_completo, rol) VALUES (?,?,?,?,?)'
  )
  insertarUsuario.run(estacionamientoId, 'admin', hashPassword('admin'), 'Administrador', 'admin')
  insertarUsuario.run(estacionamientoId, 'empleado', hashPassword('empleado'), 'Empleado de prueba', 'empleado')

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

  const insertarTipo = db.prepare('INSERT INTO tipos_vehiculo (estacionamiento_id, nombre, orden) VALUES (?,?,?)')
  const insertarTarifa = db.prepare(
    'INSERT INTO tarifas_progresivas (estacionamiento_id, tipo_vehiculo_id, tarifa_maxima_diaria, vigente_desde) VALUES (?,?,?,?)'
  )
  const insertarBloque = db.prepare(
    'INSERT INTO tarifas_progresivas_bloques (tarifa_progresiva_id, numero_bloque, precio) VALUES (?,?,?)'
  )

  TIPOS_SEED.forEach((tipo, index) => {
    const tipoVehiculoId = insertarTipo.run(estacionamientoId, tipo.nombre, index).lastInsertRowid as number
    const tarifaId = insertarTarifa.run(estacionamientoId, tipoVehiculoId, tipo.tarifaMaximaDiaria, ahora)
      .lastInsertRowid as number
    tipo.preciosPorBloque.forEach((precio, i) => insertarBloque.run(tarifaId, i + 1, precio))
  })
}

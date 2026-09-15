import type { DB } from './index'
import { elegirSiguienteSerie, SerieFolioEstado } from '../logic/reparteSeries'
import { MARCADOR_VALIDO, MARCADORES_DISPONIBLES } from '../logic/folioBarcode'

interface SerieFolioRow {
  id: number
  estacionamiento_id: number
  serie: string
  marcador: string | null
  proporcion: number
  siguiente_numero: number
  contador_emitidos: number
  activo: number
}

export interface FolioAsignado {
  serie: string
  folio: number
}

/**
 * Asigna el siguiente folio a emitir para un estacionamiento, eligiendo la
 * serie según el reparto ponderado (ver src/logic/reparteSeries.ts) y
 * avanzando su contador de forma atómica.
 */
export function asignarSiguienteFolio(db: DB, estacionamientoId: number): FolioAsignado {
  const transaccion = db.transaction((): FolioAsignado => {
    const filas = db
      .prepare<[number], SerieFolioRow>(
        'SELECT * FROM series_folio WHERE estacionamiento_id = ? AND activo = 1 ORDER BY serie'
      )
      .all(estacionamientoId)

    const estados: SerieFolioEstado[] = filas.map((f) => ({
      id: f.id,
      serie: f.serie,
      proporcion: f.proporcion,
      contadorEmitidos: f.contador_emitidos,
      activo: f.activo === 1
    }))

    const elegida = elegirSiguienteSerie(estados)
    const fila = filas.find((f) => f.id === elegida.id)!

    db.prepare(
      'UPDATE series_folio SET siguiente_numero = siguiente_numero + 1, contador_emitidos = contador_emitidos + 1 WHERE id = ?'
    ).run(elegida.id)

    return { serie: elegida.serie, folio: fila.siguiente_numero }
  })

  return transaccion()
}

export interface SerieFolioAdmin {
  id: number
  serie: string
  marcador: string | null
  proporcion: number
  siguienteNumero: number
  contadorEmitidos: number
  activo: boolean
}

export function listarSeries(db: DB, estacionamientoId: number): SerieFolioAdmin[] {
  const filas = db
    .prepare<[number], SerieFolioRow>('SELECT * FROM series_folio WHERE estacionamiento_id = ? ORDER BY serie')
    .all(estacionamientoId)

  return filas.map((f) => ({
    id: f.id,
    serie: f.serie,
    marcador: f.marcador,
    proporcion: f.proporcion,
    siguienteNumero: f.siguiente_numero,
    contadorEmitidos: f.contador_emitidos,
    activo: f.activo === 1
  }))
}

/** Marcador que sustituye a la letra de esta serie en el folio impreso (ver formatearFolioImpreso). Ignora `activo`: una serie desactivada puede tener boletos abiertos que igual necesitan imprimirse/cobrarse. */
export function obtenerMarcadorDeSerie(db: DB, estacionamientoId: number, serie: string): string | null {
  const fila = db
    .prepare<[number, string], { marcador: string | null }>(
      'SELECT marcador FROM series_folio WHERE estacionamiento_id = ? AND serie = ?'
    )
    .get(estacionamientoId, serie)
  return fila?.marcador ?? null
}

/** Inverso de obtenerMarcadorDeSerie — para resolver un folio escaneado (ver cobrarBoletoPorTextoEscaneado en src/db/boletos.ts). También ignora `activo`. */
export function buscarSeriePorMarcador(db: DB, estacionamientoId: number, marcador: string): string | null {
  const fila = db
    .prepare<[number, string], { serie: string }>(
      'SELECT serie FROM series_folio WHERE estacionamiento_id = ? AND marcador = ?'
    )
    .get(estacionamientoId, marcador)
  return fila?.serie ?? null
}

function validarMarcador(db: DB, estacionamientoId: number, marcador: string, excluirId?: number): void {
  if (!MARCADOR_VALIDO.test(marcador)) {
    throw new Error(`El marcador debe ser uno de: ${MARCADORES_DISPONIBLES.join(' ')}`)
  }
  const fila = db
    .prepare<[number, string], { id: number }>('SELECT id FROM series_folio WHERE estacionamiento_id = ? AND marcador = ?')
    .get(estacionamientoId, marcador)
  if (fila && fila.id !== excluirId) {
    throw new Error(`El marcador "${marcador}" ya lo usa otra serie de este estacionamiento`)
  }
}

export interface ActualizarSerieInput {
  id: number
  marcador: string
  proporcion: number
  activo: boolean
}

export function actualizarSerie(db: DB, input: ActualizarSerieInput): void {
  const fila = db
    .prepare<[number], { estacionamiento_id: number }>('SELECT estacionamiento_id FROM series_folio WHERE id = ?')
    .get(input.id)
  if (!fila) {
    throw new Error('No existe esa serie')
  }
  validarMarcador(db, fila.estacionamiento_id, input.marcador, input.id)

  db.prepare('UPDATE series_folio SET marcador = ?, proporcion = ?, activo = ? WHERE id = ?').run(
    input.marcador,
    input.proporcion,
    input.activo ? 1 : 0,
    input.id
  )
}

export interface NuevaSerieInput {
  estacionamientoId: number
  serie: string
  marcador: string
  proporcion: number
}

// Mismo alfabeto que espera parsearFolioImpreso() en src/logic/folioBarcode.ts,
// y lo único que Code128 codifica sin problema: si se cuela un símbolo raro
// (ej. "°"), JsBarcode revienta al imprimir el boleto. Se valida aquí, al
// crear, para no descubrirlo hasta que alguien intente emitir con esa serie.
const SERIE_VALIDA = /^[A-Z]{1,3}$/

export function crearSerie(db: DB, input: NuevaSerieInput): SerieFolioAdmin {
  const serie = input.serie.trim().toUpperCase()
  if (!SERIE_VALIDA.test(serie)) {
    throw new Error('La serie debe ser de 1 a 3 letras (A-Z), sin números, espacios ni símbolos')
  }
  validarMarcador(db, input.estacionamientoId, input.marcador)

  // boletos.serie es texto suelto, no una referencia a esta tabla — si esta
  // letra ya se usó antes (una serie que se borró y se vuelve a crear),
  // arrancar en 1 chocaría con folios viejos que ya existen. Se continúa
  // después del folio más alto que se haya usado alguna vez con esta letra.
  const { maxFolio } = db
    .prepare<[number, string], { maxFolio: number | null }>(
      'SELECT MAX(folio) AS maxFolio FROM boletos WHERE estacionamiento_id = ? AND serie = ?'
    )
    .get(input.estacionamientoId, serie)!

  const siguienteNumero = (maxFolio ?? 0) + 1

  const id = db
    .prepare(
      'INSERT INTO series_folio (estacionamiento_id, serie, marcador, proporcion, siguiente_numero) VALUES (?,?,?,?,?)'
    )
    .run(input.estacionamientoId, serie, input.marcador, input.proporcion, siguienteNumero).lastInsertRowid as number

  return {
    id,
    serie,
    marcador: input.marcador,
    proporcion: input.proporcion,
    siguienteNumero,
    contadorEmitidos: 0,
    activo: true
  }
}

/**
 * Reestablece manualmente el próximo folio a emitir de una serie — para
 * empatar con la numeración de un sistema anterior (ej. ya se venían usando
 * boletos físicos o un software de facturación hasta cierto folio, y se
 * quiere continuar desde ahí en vez de reiniciar en 1). No se permite bajar
 * a un número ya usado por un boleto existente de esa serie: chocaría con
 * el UNIQUE (estacionamiento_id, serie, folio) en cuanto se emitiera.
 */
export function establecerSiguienteNumero(db: DB, id: number, nuevoNumero: number): void {
  if (!Number.isInteger(nuevoNumero) || nuevoNumero < 1) {
    throw new Error('El número debe ser un entero mayor o igual a 1')
  }

  const serie = db
    .prepare<[number], { estacionamiento_id: number; serie: string }>(
      'SELECT estacionamiento_id, serie FROM series_folio WHERE id = ?'
    )
    .get(id)
  if (!serie) {
    throw new Error('No existe esa serie')
  }

  const { maxFolio } = db
    .prepare<[number, string], { maxFolio: number | null }>(
      'SELECT MAX(folio) AS maxFolio FROM boletos WHERE estacionamiento_id = ? AND serie = ?'
    )
    .get(serie.estacionamiento_id, serie.serie)!

  if (maxFolio != null && nuevoNumero <= maxFolio) {
    throw new Error(`Ya existe un boleto con folio ${maxFolio} en esta serie — el número debe ser mayor`)
  }

  db.prepare('UPDATE series_folio SET siguiente_numero = ? WHERE id = ?').run(nuevoNumero, id)
}

/**
 * boletos.serie guarda la letra como texto, no una referencia a esta tabla
 * — eliminar una serie no afecta boletos ya emitidos con esa letra, solo
 * hace que deje de estar disponible para folios nuevos. Si se vuelve a
 * crear la misma letra más adelante, el contador arranca de nuevo en 1; el
 * UNIQUE (estacionamiento_id, serie, folio) de todas formas impide que
 * choque con folios viejos de esa letra que sigan abiertos.
 */
export function eliminarSerie(db: DB, id: number): void {
  db.prepare('DELETE FROM series_folio WHERE id = ?').run(id)
}

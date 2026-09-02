import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { actualizarCargoBoletoPerdido, obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerUsuarioPorDefecto } from './usuarios'
import { listarTiposVehiculo } from './tiposVehiculo'
import {
  buscarBoletoAbiertoPorFolio,
  cerrarBoleto,
  cerrarBoletoPerdido,
  cobrarBoletoPorFolio,
  emitirBoleto,
  listarBoletosAbiertos,
  obtenerDetalleIntentoRecobro,
  obtenerResumen,
  RecobroSospechosoError
} from './boletos'
import { hacerCorte } from './cortes'

let db: DB
let estacionamientoId: number
let usuarioId: number
let tipoAutoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)

  const estacionamiento = obtenerEstacionamientoActual(db)
  estacionamientoId = estacionamiento.id
  usuarioId = obtenerUsuarioPorDefecto(db, estacionamientoId).id

  const tipos = listarTiposVehiculo(db, estacionamientoId)
  tipoAutoId = tipos.find((t) => t.nombre === 'Auto')!.id
})

describe('sembrarSiVacio', () => {
  it('crea un estacionamiento con 3 tipos de vehículo y 2 series de folio', () => {
    const tipos = listarTiposVehiculo(db, estacionamientoId)
    expect(tipos.map((t) => t.nombre)).toEqual(['Auto', 'Camioneta', 'Camión'])

    const series = db.prepare('SELECT serie FROM series_folio WHERE estacionamiento_id = ?').all(estacionamientoId)
    expect(series).toHaveLength(2)
  })

  it('no duplica datos si se llama dos veces', () => {
    sembrarSiVacio(db)
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM estacionamientos').get() as { n: number }
    expect(n).toBe(1)
  })
})

describe('emitirBoleto', () => {
  it('emite un boleto con folio de la serie correspondiente', () => {
    const boleto = emitirBoleto(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      usuarioEmisionId: usuarioId
    })

    expect(boleto.serie).toBe('A') // primer boleto: A tiene mayor proporción
    expect(boleto.folio).toBe(1)
    expect(boleto.horaEntrada).toBeTruthy()
  })

  it('aparece en listarBoletosAbiertos', () => {
    emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    const abiertos = listarBoletosAbiertos(db, estacionamientoId)

    expect(abiertos).toHaveLength(1)
    expect(abiertos[0]).toMatchObject({ serie: 'A', folio: 1, tipoVehiculo: 'Auto', estado: 'abierto' })
  })

  it('guarda la placa cuando se captura, y null cuando no', () => {
    const conPlaca = emitirBoleto(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      usuarioEmisionId: usuarioId,
      placa: 'ABC-123'
    })
    const sinPlaca = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })

    const abiertos = listarBoletosAbiertos(db, estacionamientoId)
    expect(abiertos.find((b) => b.id === conPlaca.id)?.placa).toBe('ABC-123')
    expect(abiertos.find((b) => b.id === sinPlaca.id)?.placa).toBeNull()
  })

  it('se puede encontrar por serie+folio con buscarBoletoAbiertoPorFolio', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })

    const encontrado = buscarBoletoAbiertoPorFolio(db, estacionamientoId, emitido.serie, emitido.folio)
    expect(encontrado?.id).toBe(emitido.id)

    expect(buscarBoletoAbiertoPorFolio(db, estacionamientoId, 'Z', 999)).toBeNull()
  })

  it('no encuentra un boleto ya cerrado (evita cobrarlo dos veces por el mismo escaneo)', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })

    expect(buscarBoletoAbiertoPorFolio(db, estacionamientoId, emitido.serie, emitido.folio)).toBeNull()
  })

  it('falla si el tipo de vehículo no existe o no tiene tarifa vigente', () => {
    expect(() =>
      emitirBoleto(db, { estacionamientoId, tipoVehiculoId: 9999, usuarioEmisionId: usuarioId })
    ).toThrow('No hay una tarifa progresiva vigente')
  })

  it('no deja folio "quemado" si falla la emisión (todo o nada)', () => {
    try {
      emitirBoleto(db, { estacionamientoId, tipoVehiculoId: 9999, usuarioEmisionId: usuarioId })
    } catch {
      // esperado
    }

    const boleto = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    expect(boleto.folio).toBe(1) // no se saltó al 2 por el intento fallido
  })
})

/** Mueve hora_entrada al pasado para simular tiempo transcurrido sin esperar en tiempo real. */
function backdatar(db: DB, boletoId: number, minutosAtras: number): void {
  const horaEntrada = new Date(Date.now() - minutosAtras * 60 * 1000).toISOString()
  db.prepare('UPDATE boletos SET hora_entrada = ? WHERE id = ?').run(horaEntrada, boletoId)
}

describe('cerrarBoleto', () => {
  it('cobra $0 si se cierra de inmediato (0 bloques)', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    const cierre = cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })

    expect(cierre.tipoCobro).toBe('regular')
    expect(cierre.minutosTotales).toBe(0)
    expect(cierre.monto).toBe(0)
  })

  it('cobra tarifa regular progresiva según el tiempo transcurrido (1h -> $40, tarifas del seed Auto)', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(db, emitido.id, 60)

    const cierre = cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
    expect(cierre.monto).toBe(40)
  })

  it('respeta el tope diario configurado (20h -> $300 para Auto)', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(db, emitido.id, 20 * 60)

    const cierre = cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
    expect(cierre.monto).toBe(300)
  })

  it('deja el boleto en estado cerrado y ya no aparece en listarBoletosAbiertos', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })

    expect(listarBoletosAbiertos(db, estacionamientoId)).toHaveLength(0)
  })

  it('calcula tarifa plana con excedente a tarifa regular (mismo caso que motorTarifas: $80 por 8h, sale a las 9h -> $120)', () => {
    const tarifaPlanaId = db
      .prepare(
        `INSERT INTO tarifas_planas (estacionamiento_id, tipo_vehiculo_id, nombre, precio_fijo, horas_incluidas, vigente_desde)
         VALUES (?,?,?,?,?,?)`
      )
      .run(estacionamientoId, tipoAutoId, 'Plana 8h', 80, 8, new Date().toISOString()).lastInsertRowid as number

    // Todavía no hay UI para elegir tarifa plana al emitir, así que se marca a mano.
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    db.prepare('UPDATE boletos SET tarifa_plana_id = ? WHERE id = ?').run(tarifaPlanaId, emitido.id)
    backdatar(db, emitido.id, 9 * 60)

    const cierre = cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
    expect(cierre.tipoCobro).toBe('plana')
    expect(cierre.excedenteMinutos).toBe(60)
    expect(cierre.excedenteMonto).toBe(40)
    expect(cierre.monto).toBe(120)
  })

  it('lanza error si el boleto no existe', () => {
    expect(() => cerrarBoleto(db, { boletoId: 9999, usuarioCobroId: usuarioId })).toThrow('No existe el boleto')
  })

  it('lanza error si el boleto ya está cerrado', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })

    expect(() => cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })).toThrow('ya está cerrado')
  })
})

describe('cerrarBoletoPerdido', () => {
  it('suma el cargo configurado al cobro normal y lo marca como perdido', () => {
    actualizarCargoBoletoPerdido(db, estacionamientoId, 50)
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(db, emitido.id, 60)

    const cierre = cerrarBoletoPerdido(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })

    expect(cierre.monto).toBe(90) // $40 de tarifa regular (1h) + $50 de recargo
    expect(cierre.recargoBoletoPerdido).toBe(50)

    const fila = db.prepare('SELECT boleto_perdido, recargo_boleto_perdido FROM boletos WHERE id = ?').get(emitido.id) as {
      boleto_perdido: number
      recargo_boleto_perdido: number
    }
    expect(fila.boleto_perdido).toBe(1)
    expect(fila.recargo_boleto_perdido).toBe(50)
  })

  it('sin cargo configurado (default 0), cobra igual que cerrarBoleto', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(db, emitido.id, 60)

    const cierre = cerrarBoletoPerdido(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
    expect(cierre.monto).toBe(40)
    expect(cierre.recargoBoletoPerdido).toBe(0)
  })

  it('no aparece en listarBoletosAbiertos después de cerrarlo', () => {
    actualizarCargoBoletoPerdido(db, estacionamientoId, 50)
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })

    cerrarBoletoPerdido(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })
    expect(listarBoletosAbiertos(db, estacionamientoId)).toHaveLength(0)
  })

  it('lanza error si el boleto no existe', () => {
    expect(() => cerrarBoletoPerdido(db, { boletoId: 9999, usuarioCobroId: usuarioId })).toThrow('No existe el boleto')
  })
})

describe('cobrarBoletoPorFolio', () => {
  it('cobra el boleto correspondiente al folio escaneado', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    backdatar(db, emitido.id, 60)

    const cierre = cobrarBoletoPorFolio(db, {
      estacionamientoId,
      serie: emitido.serie,
      folio: emitido.folio,
      usuarioCobroId: usuarioId
    })

    expect(cierre.id).toBe(emitido.id)
    expect(cierre.monto).toBe(40)
  })

  it('lanza error si el folio nunca existió', () => {
    expect(() =>
      cobrarBoletoPorFolio(db, { estacionamientoId, serie: 'Z', folio: 999, usuarioCobroId: usuarioId })
    ).toThrow('No existe ningún boleto con folio Z-999')
  })

  it('lanza un error normal (no sospechoso) en el primer reescaneo, y deja registro en intentos_recobro', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    cobrarBoletoPorFolio(db, { estacionamientoId, serie: emitido.serie, folio: emitido.folio, usuarioCobroId: usuarioId })

    try {
      cobrarBoletoPorFolio(db, { estacionamientoId, serie: emitido.serie, folio: emitido.folio, usuarioCobroId: usuarioId })
      expect.unreachable()
    } catch (e) {
      expect(e).not.toBeInstanceOf(RecobroSospechosoError)
      expect((e as Error).message).toContain('ya fue cobrado antes')
    }

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM intentos_recobro WHERE boleto_id = ?').get(emitido.id) as {
      n: number
    }
    expect(n).toBe(1)
  })

  it('lanza RecobroSospechosoError en el segundo reescaneo del mismo boleto (2+ intentos)', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    cobrarBoletoPorFolio(db, { estacionamientoId, serie: emitido.serie, folio: emitido.folio, usuarioCobroId: usuarioId })
    expect(() =>
      cobrarBoletoPorFolio(db, { estacionamientoId, serie: emitido.serie, folio: emitido.folio, usuarioCobroId: usuarioId })
    ).toThrow() // primer reescaneo, todavía no sospechoso

    try {
      cobrarBoletoPorFolio(db, { estacionamientoId, serie: emitido.serie, folio: emitido.folio, usuarioCobroId: usuarioId })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(RecobroSospechosoError)
      expect((e as RecobroSospechosoError).boletoId).toBe(emitido.id)
      expect((e as RecobroSospechosoError).intentos).toBe(2)
      expect((e as RecobroSospechosoError).usuarioId).toBe(usuarioId)
    }
  })

  it('lanza un error distinto si el boleto está cancelado (sin registrar intento de recobro)', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    db.prepare("UPDATE boletos SET estado = 'cancelado' WHERE id = ?").run(emitido.id)

    expect(() =>
      cobrarBoletoPorFolio(db, { estacionamientoId, serie: emitido.serie, folio: emitido.folio, usuarioCobroId: usuarioId })
    ).toThrow('está cancelado')

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM intentos_recobro WHERE boleto_id = ?').get(emitido.id) as {
      n: number
    }
    expect(n).toBe(0)
  })
})

describe('obtenerDetalleIntentoRecobro', () => {
  it('trae serie, folio, tipo de vehículo, usuario y el conteo de intentos', () => {
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    cobrarBoletoPorFolio(db, { estacionamientoId, serie: emitido.serie, folio: emitido.folio, usuarioCobroId: usuarioId })
    try {
      cobrarBoletoPorFolio(db, { estacionamientoId, serie: emitido.serie, folio: emitido.folio, usuarioCobroId: usuarioId })
    } catch {
      // esperado — solo interesa el estado que deja, no el error en sí
    }

    const detalle = obtenerDetalleIntentoRecobro(db, emitido.id, usuarioId)
    expect(detalle).toEqual({
      serie: emitido.serie,
      folio: emitido.folio,
      tipoVehiculo: 'Auto',
      nombreUsuario: 'Administrador',
      intentos: 1
    })
  })

  it('lanza error si el boleto no existe', () => {
    expect(() => obtenerDetalleIntentoRecobro(db, 9999, usuarioId)).toThrow('No existe el boleto')
  })
})

describe('obtenerResumen', () => {
  it('en cero al inicio', () => {
    expect(obtenerResumen(db, estacionamientoId)).toEqual({ entradasDesdeUltimoCorte: 0, actualmenteDentro: 0 })
  })

  it('cuenta las entradas y los que siguen abiertos, sin mezclarlos', () => {
    emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    const cerrado = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    cerrarBoleto(db, { boletoId: cerrado.id, usuarioCobroId: usuarioId })

    const resumen = obtenerResumen(db, estacionamientoId)
    expect(resumen.entradasDesdeUltimoCorte).toBe(3) // las 3 entraron, sin importar si ya salieron
    expect(resumen.actualmenteDentro).toBe(2) // solo los que siguen abiertos
  })

  it('generar un corte reinicia entradasDesdeUltimoCorte, pero no actualmenteDentro', async () => {
    emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })

    expect(obtenerResumen(db, estacionamientoId).entradasDesdeUltimoCorte).toBe(2)

    await new Promise((resolve) => setTimeout(resolve, 5))
    hacerCorte(db, estacionamientoId, usuarioId)

    const resumen = obtenerResumen(db, estacionamientoId)
    expect(resumen.entradasDesdeUltimoCorte).toBe(0) // se reinició
    expect(resumen.actualmenteDentro).toBe(2) // el boleto abierto sigue contando, corte o no
  })

  it('un boleto emitido después del corte sí cuenta en entradasDesdeUltimoCorte', async () => {
    emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    await new Promise((resolve) => setTimeout(resolve, 5))
    hacerCorte(db, estacionamientoId, usuarioId)
    await new Promise((resolve) => setTimeout(resolve, 5))

    emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })

    expect(obtenerResumen(db, estacionamientoId).entradasDesdeUltimoCorte).toBe(1)
  })

  it('no cuenta boletos de otros estacionamientos', () => {
    const otroEstId = db
      .prepare('INSERT INTO estacionamientos (nombre) VALUES (?)')
      .run('Otro').lastInsertRowid as number

    emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })

    expect(obtenerResumen(db, otroEstId)).toEqual({ entradasDesdeUltimoCorte: 0, actualmenteDentro: 0 })
  })
})


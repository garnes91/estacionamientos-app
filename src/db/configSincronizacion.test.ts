import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { obtenerUsuarioPorDefecto } from './usuarios'
import { listarTiposVehiculoAdmin } from './tiposVehiculo'
import { obtenerTarifaProgresivaActivaPorTipo } from './tarifas'
import { crearTarifaPlana, listarTarifasPlanas } from './tarifasPlanas'
import { listarSeries } from './series'
import { cerrarBoleto, emitirBoleto } from './boletos'
import { BLOQUES_CONFIGURABLES } from '../logic/motorTarifas'
import { aplicarConfigSincronizable, construirConfigSincronizable, ConfigSincronizable } from './configSincronizacion'

let db: DB
let estacionamientoId: number
let tipoAutoId: number

beforeEach(() => {
  db = abrirDb(':memory:')
  sembrarSiVacio(db)
  estacionamientoId = obtenerEstacionamientoActual(db).id
  tipoAutoId = listarTiposVehiculoAdmin(db, estacionamientoId).find((t) => t.nombre === 'Auto')!.id
})

describe('construirConfigSincronizable', () => {
  it('incluye tipos de vehículo con su tarifa, tarifas planas, series y texto/nombre', () => {
    const config = construirConfigSincronizable(db, estacionamientoId)

    expect(config.nombre).toBeTruthy()
    const auto = config.tiposVehiculo.find((t) => t.id === tipoAutoId)!
    expect(auto.preciosPorBloque).toHaveLength(BLOQUES_CONFIGURABLES)
    expect(auto.tarifaMaximaDiaria).toBe(300)
    expect(config.series.length).toBeGreaterThan(0)
  })
})

describe('aplicarConfigSincronizable', () => {
  it('actualiza nombre y texto del boleto', () => {
    const config = construirConfigSincronizable(db, estacionamientoId)
    config.nombre = 'Estacionamiento Remoto'
    config.textoBoleto = 'RFC: ABC123'

    aplicarConfigSincronizable(db, estacionamientoId, config)

    const actualizado = obtenerEstacionamientoActual(db)
    expect(actualizado.nombre).toBe('Estacionamiento Remoto')
    expect(actualizado.textoBoleto).toBe('RFC: ABC123')
  })

  it('crea una nueva tarifa progresiva versionada solo si los precios cambiaron', () => {
    const config = construirConfigSincronizable(db, estacionamientoId)
    const auto = config.tiposVehiculo.find((t) => t.id === tipoAutoId)!
    auto.preciosPorBloque = auto.preciosPorBloque!.map((p) => p + 1)
    auto.tarifaMaximaDiaria = 999

    aplicarConfigSincronizable(db, estacionamientoId, config)

    const nueva = obtenerTarifaProgresivaActivaPorTipo(db, tipoAutoId)!
    expect(nueva.tarifaMaximaDiaria).toBe(999)
    expect(nueva.preciosPorBloque).toEqual(auto.preciosPorBloque)

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM tarifas_progresivas WHERE tipo_vehiculo_id = ?').get(tipoAutoId) as {
      n: number
    }
    expect(n).toBe(2) // la original (ahora cerrada) + la nueva

    // Volver a aplicar el mismo config (sin cambios) no debe crear otra versión.
    aplicarConfigSincronizable(db, estacionamientoId, config)
    const { n: n2 } = db.prepare('SELECT COUNT(*) AS n FROM tarifas_progresivas WHERE tipo_vehiculo_id = ?').get(tipoAutoId) as {
      n: number
    }
    expect(n2).toBe(2)
  })

  it('actualiza proporción/activo de una serie y reestablece su próximo folio', () => {
    const config = construirConfigSincronizable(db, estacionamientoId)
    const serieA = config.series.find((s) => s.serie === 'A')!
    serieA.proporcion = 7
    serieA.siguienteNumero = 500

    aplicarConfigSincronizable(db, estacionamientoId, config)

    const actualizada = listarSeries(db, estacionamientoId).find((s) => s.serie === 'A')!
    expect(actualizada.proporcion).toBe(7)
    expect(actualizada.siguienteNumero).toBe(500)
  })

  it('cambia precio de una tarifa plana creando una versión nueva', () => {
    crearTarifaPlana(db, {
      estacionamientoId,
      tipoVehiculoId: tipoAutoId,
      nombre: 'Plana básica',
      precioFijo: 100,
      horasIncluidas: 4
    })

    const config = construirConfigSincronizable(db, estacionamientoId)
    const plana = config.tarifasPlanas.find((p) => p.nombre === 'Plana básica')!
    plana.precioFijo = 150

    aplicarConfigSincronizable(db, estacionamientoId, config)

    const actual = listarTarifasPlanas(db, estacionamientoId).find((p) => p.nombre === 'Plana básica')!
    expect(actual.precioFijo).toBe(150)
  })

  it('ignora entidades que ya no existen localmente en vez de fallar', () => {
    const config: ConfigSincronizable = {
      nombre: 'X',
      textoBoleto: null,
      tiposVehiculo: [{ id: 999999, nombre: 'Fantasma', activo: true, tarifaMaximaDiaria: 10, preciosPorBloque: [] }],
      tarifasPlanas: [{ id: 999999, tipoVehiculoId: tipoAutoId, nombre: 'Fantasma', precioFijo: 1, horasIncluidas: 1, activo: true }],
      series: [{ id: 999999, serie: 'Z', proporcion: 1, activo: true, siguienteNumero: 1 }]
    }

    const { errores } = aplicarConfigSincronizable(db, estacionamientoId, config)
    expect(errores).toEqual([])
  })

  it('crea un tipo de vehículo nuevo (id: null) con su tarifa inicial, utilizable de inmediato', () => {
    const config = construirConfigSincronizable(db, estacionamientoId)
    config.tiposVehiculo.push({
      id: null,
      nombre: 'Motocicleta',
      activo: true,
      tarifaMaximaDiaria: 150,
      preciosPorBloque: Array(BLOQUES_CONFIGURABLES).fill(5)
    })

    const { errores } = aplicarConfigSincronizable(db, estacionamientoId, config)

    expect(errores).toEqual([])
    const creado = listarTiposVehiculoAdmin(db, estacionamientoId).find((t) => t.nombre === 'Motocicleta')!
    expect(creado).toBeTruthy()
    const tarifa = obtenerTarifaProgresivaActivaPorTipo(db, creado.id)!
    expect(tarifa.tarifaMaximaDiaria).toBe(150)
  })

  it('crea un tipo de vehículo nuevo sin tarifa inicial si no se manda una', () => {
    const config = construirConfigSincronizable(db, estacionamientoId)
    config.tiposVehiculo.push({ id: null, nombre: 'Bicicleta', activo: true, tarifaMaximaDiaria: null, preciosPorBloque: null })

    const { errores } = aplicarConfigSincronizable(db, estacionamientoId, config)

    expect(errores).toEqual([])
    const creado = listarTiposVehiculoAdmin(db, estacionamientoId).find((t) => t.nombre === 'Bicicleta')!
    expect(obtenerTarifaProgresivaActivaPorTipo(db, creado.id)).toBeNull()
  })

  it('elimina un tipo de vehículo sin boletos ni tarifas asociadas', () => {
    // Los tipos del seed ya tienen tarifa progresiva (y por lo tanto una FK
    // que bloquearía el DELETE) — se crea uno nuevo, sin tarifa, para
    // probar el caso de eliminación limpia.
    const config = construirConfigSincronizable(db, estacionamientoId)
    config.tiposVehiculo.push({ id: null, nombre: 'Sin tarifa', activo: true, tarifaMaximaDiaria: null, preciosPorBloque: null })
    aplicarConfigSincronizable(db, estacionamientoId, config)

    const config2 = construirConfigSincronizable(db, estacionamientoId)
    const nuevo = config2.tiposVehiculo.find((t) => t.nombre === 'Sin tarifa')!
    nuevo.eliminar = true

    const { errores } = aplicarConfigSincronizable(db, estacionamientoId, config2)

    expect(errores).toEqual([])
    expect(listarTiposVehiculoAdmin(db, estacionamientoId).some((t) => t.nombre === 'Sin tarifa')).toBe(false)
  })

  it('no elimina un tipo de vehículo con boletos asociados — reporta el error y sigue con el resto del lote', () => {
    const usuarioId = obtenerUsuarioPorDefecto(db, estacionamientoId).id
    const emitido = emitirBoleto(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, usuarioEmisionId: usuarioId })
    cerrarBoleto(db, { boletoId: emitido.id, usuarioCobroId: usuarioId })

    const config = construirConfigSincronizable(db, estacionamientoId)
    const auto = config.tiposVehiculo.find((t) => t.id === tipoAutoId)!
    auto.eliminar = true
    config.nombre = 'Nombre que sí debe aplicarse'

    const { errores } = aplicarConfigSincronizable(db, estacionamientoId, config)

    expect(errores).toHaveLength(1)
    expect(errores[0]).toContain('Auto')
    expect(listarTiposVehiculoAdmin(db, estacionamientoId).some((t) => t.id === tipoAutoId)).toBe(true)
    expect(obtenerEstacionamientoActual(db).nombre).toBe('Nombre que sí debe aplicarse')
  })

  it('crea una tarifa plana nueva referenciando un tipo de vehículo existente', () => {
    const config = construirConfigSincronizable(db, estacionamientoId)
    config.tarifasPlanas.push({
      id: null,
      tipoVehiculoId: tipoAutoId,
      nombre: 'Medio día',
      precioFijo: 80,
      horasIncluidas: 4,
      activo: true
    })

    const { errores } = aplicarConfigSincronizable(db, estacionamientoId, config)

    expect(errores).toEqual([])
    expect(listarTarifasPlanas(db, estacionamientoId).some((p) => p.nombre === 'Medio día')).toBe(true)
  })

  it('no crea una tarifa plana que referencia un tipo de vehículo inexistente — reporta el error', () => {
    const config = construirConfigSincronizable(db, estacionamientoId)
    config.tarifasPlanas.push({
      id: null,
      tipoVehiculoId: 999999,
      nombre: 'Fantasma',
      precioFijo: 80,
      horasIncluidas: 4,
      activo: true
    })

    const { errores } = aplicarConfigSincronizable(db, estacionamientoId, config)

    expect(errores).toHaveLength(1)
    expect(listarTarifasPlanas(db, estacionamientoId).some((p) => p.nombre === 'Fantasma')).toBe(false)
  })

  it('"eliminar" en una tarifa plana la desactiva, no la borra', () => {
    crearTarifaPlana(db, { estacionamientoId, tipoVehiculoId: tipoAutoId, nombre: 'Plana básica', precioFijo: 100, horasIncluidas: 4 })

    const config = construirConfigSincronizable(db, estacionamientoId)
    const plana = config.tarifasPlanas.find((p) => p.nombre === 'Plana básica')!
    plana.eliminar = true

    const { errores } = aplicarConfigSincronizable(db, estacionamientoId, config)

    expect(errores).toEqual([])
    const actual = listarTarifasPlanas(db, estacionamientoId).find((p) => p.nombre === 'Plana básica')!
    expect(actual).toBeTruthy()
    expect(actual.activo).toBe(false)
  })

  it('crea una serie nueva y elimina una existente', () => {
    const config = construirConfigSincronizable(db, estacionamientoId)
    config.series.push({ id: null, serie: 'C', proporcion: 2, activo: true, siguienteNumero: 1 })
    const serieB = config.series.find((s) => s.serie === 'B')!
    serieB.eliminar = true

    const { errores } = aplicarConfigSincronizable(db, estacionamientoId, config)

    expect(errores).toEqual([])
    const series = listarSeries(db, estacionamientoId)
    expect(series.some((s) => s.serie === 'C')).toBe(true)
    expect(series.some((s) => s.serie === 'B')).toBe(false)
  })

  it('una serie con formato inválido en el lote no bloquea que se cree la otra que sí es válida', () => {
    const config = construirConfigSincronizable(db, estacionamientoId)
    config.series.push({ id: null, serie: 'CC-1', proporcion: 1, activo: true, siguienteNumero: 1 })
    config.series.push({ id: null, serie: 'D', proporcion: 1, activo: true, siguienteNumero: 1 })

    const { errores } = aplicarConfigSincronizable(db, estacionamientoId, config)

    expect(errores).toHaveLength(1)
    const series = listarSeries(db, estacionamientoId)
    expect(series.some((s) => s.serie === 'D')).toBe(true)
  })
})

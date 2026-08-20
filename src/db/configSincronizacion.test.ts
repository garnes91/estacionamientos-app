import { beforeEach, describe, expect, it } from 'vitest'
import { abrirDb, DB } from './index'
import { sembrarSiVacio } from './seed'
import { obtenerEstacionamientoActual } from './estacionamientos'
import { listarTiposVehiculoAdmin } from './tiposVehiculo'
import { obtenerTarifaProgresivaActivaPorTipo } from './tarifas'
import { crearTarifaPlana, listarTarifasPlanas } from './tarifasPlanas'
import { listarSeries } from './series'
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

    expect(() => aplicarConfigSincronizable(db, estacionamientoId, config)).not.toThrow()
  })
})

import type { DB } from './index'
import { obtenerEstacionamientoActual, actualizarNombreEstacionamiento, actualizarTextoBoleto } from './estacionamientos'
import { listarTiposVehiculoAdmin, actualizarTipoVehiculo } from './tiposVehiculo'
import { obtenerTarifaProgresivaActivaPorTipo, actualizarTarifaProgresiva } from './tarifas'
import { listarTarifasPlanas, actualizarTarifaPlana, cambiarPrecioTarifaPlana } from './tarifasPlanas'
import { listarSeries, actualizarSerie, establecerSiguienteNumero } from './series'

export interface ConfigTipoVehiculoSync {
  id: number
  nombre: string
  activo: boolean
  tarifaMaximaDiaria: number | null
  preciosPorBloque: number[] | null
}

export interface ConfigTarifaPlanaSync {
  id: number
  tipoVehiculoId: number
  nombre: string
  precioFijo: number
  horasIncluidas: number
  activo: boolean
}

export interface ConfigSerieSync {
  id: number
  serie: string
  proporcion: number
  activo: boolean
  siguienteNumero: number
}

export interface ConfigSincronizable {
  nombre: string
  textoBoleto: string | null
  tiposVehiculo: ConfigTipoVehiculoSync[]
  tarifasPlanas: ConfigTarifaPlanaSync[]
  series: ConfigSerieSync[]
}

/**
 * Arma el estado actual de la configuración editable remotamente — se sube
 * a Firestore en cada latido para que un panel remoto tenga con qué
 * mostrar un formulario de edición (ver aplicarConfigSincronizable para lo
 * que pasa cuando ese panel guarda cambios).
 */
export function construirConfigSincronizable(db: DB, estacionamientoId: number): ConfigSincronizable {
  const estacionamiento = obtenerEstacionamientoActual(db)

  const tiposVehiculo = listarTiposVehiculoAdmin(db, estacionamientoId).map((t) => {
    const tarifa = obtenerTarifaProgresivaActivaPorTipo(db, t.id)
    return {
      id: t.id,
      nombre: t.nombre,
      activo: t.activo,
      tarifaMaximaDiaria: tarifa?.tarifaMaximaDiaria ?? null,
      preciosPorBloque: tarifa?.preciosPorBloque ?? null
    }
  })

  const tarifasPlanas = listarTarifasPlanas(db, estacionamientoId)
  const series = listarSeries(db, estacionamientoId).map((s) => ({
    id: s.id,
    serie: s.serie,
    proporcion: s.proporcion,
    activo: s.activo,
    siguienteNumero: s.siguienteNumero
  }))

  return { nombre: estacionamiento.nombre, textoBoleto: estacionamiento.textoBoleto, tiposVehiculo, tarifasPlanas, series }
}

/**
 * Aplica cambios hechos desde un panel remoto. A propósito solo EDITA
 * entidades que ya existen localmente (nunca crea ni elimina tipos de
 * vehículo, tarifas planas ni series desde remoto) — reconciliar altas/bajas
 * contra un snapshot que pudo quedar desactualizado en la nube es de mucho
 * más riesgo que solo actualizar valores de algo que ya existe.
 */
export function aplicarConfigSincronizable(db: DB, estacionamientoId: number, config: ConfigSincronizable): void {
  if (config.nombre?.trim()) actualizarNombreEstacionamiento(db, estacionamientoId, config.nombre)
  actualizarTextoBoleto(db, estacionamientoId, config.textoBoleto)

  const tiposActuales = listarTiposVehiculoAdmin(db, estacionamientoId)
  for (const t of config.tiposVehiculo) {
    if (!tiposActuales.some((x) => x.id === t.id)) continue
    actualizarTipoVehiculo(db, { id: t.id, nombre: t.nombre, activo: t.activo })

    if (t.preciosPorBloque && t.tarifaMaximaDiaria != null) {
      const actual = obtenerTarifaProgresivaActivaPorTipo(db, t.id)
      const cambioTarifa =
        !actual ||
        actual.tarifaMaximaDiaria !== t.tarifaMaximaDiaria ||
        actual.preciosPorBloque.length !== t.preciosPorBloque.length ||
        actual.preciosPorBloque.some((precio, i) => precio !== t.preciosPorBloque![i])

      if (cambioTarifa) {
        actualizarTarifaProgresiva(db, {
          estacionamientoId,
          tipoVehiculoId: t.id,
          tarifaMaximaDiaria: t.tarifaMaximaDiaria,
          preciosPorBloque: t.preciosPorBloque
        })
      }
    }
  }

  const planasActuales = listarTarifasPlanas(db, estacionamientoId)
  for (const p of config.tarifasPlanas) {
    const actual = planasActuales.find((x) => x.id === p.id)
    if (!actual) continue

    if (actual.precioFijo !== p.precioFijo || actual.horasIncluidas !== p.horasIncluidas) {
      cambiarPrecioTarifaPlana(db, {
        id: p.id,
        estacionamientoId,
        tipoVehiculoId: actual.tipoVehiculoId,
        nombre: p.nombre,
        precioFijo: p.precioFijo,
        horasIncluidas: p.horasIncluidas
      })
    } else if (actual.nombre !== p.nombre || actual.activo !== p.activo) {
      actualizarTarifaPlana(db, { id: p.id, nombre: p.nombre, activo: p.activo })
    }
  }

  const seriesActuales = listarSeries(db, estacionamientoId)
  for (const s of config.series) {
    if (!seriesActuales.some((x) => x.id === s.id)) continue
    actualizarSerie(db, { id: s.id, proporcion: s.proporcion, activo: s.activo })

    try {
      establecerSiguienteNumero(db, s.id, s.siguienteNumero)
    } catch {
      // El panel pudo haber mandado un número que ya no aplica (folios
      // emitidos localmente después de que se armó el snapshot remoto) —
      // se ignora en vez de tumbar el resto de los cambios pendientes.
    }
  }
}

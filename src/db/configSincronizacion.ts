import type { DB } from './index'
import { obtenerEstacionamientoActual, actualizarNombreEstacionamiento, actualizarTextoBoleto } from './estacionamientos'
import { listarTiposVehiculoAdmin, actualizarTipoVehiculo, crearTipoVehiculo, eliminarTipoVehiculo } from './tiposVehiculo'
import { obtenerTarifaProgresivaActivaPorTipo, actualizarTarifaProgresiva } from './tarifas'
import { listarTarifasPlanas, actualizarTarifaPlana, cambiarPrecioTarifaPlana, crearTarifaPlana } from './tarifasPlanas'
import { listarSeries, actualizarSerie, establecerSiguienteNumero, crearSerie, eliminarSerie } from './series'

// id: null significa "crear esta entidad nueva" — se usa en vez de inferir
// altas/bajas comparando arreglos, ver el comentario de aplicarConfigSincronizable.
export interface ConfigTipoVehiculoSync {
  id: number | null
  nombre: string
  activo: boolean
  tarifaMaximaDiaria: number | null
  preciosPorBloque: number[] | null
  eliminar?: boolean
}

export interface ConfigTarifaPlanaSync {
  id: number | null
  tipoVehiculoId: number
  nombre: string
  precioFijo: number
  horasIncluidas: number
  activo: boolean
  eliminar?: boolean
}

export interface ConfigSerieSync {
  id: number | null
  serie: string
  proporcion: number
  activo: boolean
  siguienteNumero: number
  eliminar?: boolean
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

function mensajeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Aplica cambios hechos desde un panel remoto — edita entidades que ya
 * existen, crea las que llegan con `id: null` y elimina/desactiva las que
 * llegan marcadas con `eliminar: true`.
 *
 * A propósito NUNCA infiere una baja por ausencia: una entidad que exista
 * localmente pero no venga en `config` simplemente se ignora (pudo haberse
 * creado en la app local después de que el panel remoto armó su snapshot).
 * Solo se crea o se elimina lo que el operador remoto marcó explícitamente
 * — así una foto desactualizada nunca puede borrar algo por accidente.
 *
 * Cada alta/baja va en su propio try/catch: un error en una (ej. una serie
 * con formato inválido, un tipo de vehículo con boletos asociados) no debe
 * impedir que se apliquen las demás. Los mensajes se devuelven en `errores`
 * para que quien llama (heartbeat.ts) los suba de vuelta y el panel remoto
 * sepa qué no se pudo aplicar.
 */
export function aplicarConfigSincronizable(
  db: DB,
  estacionamientoId: number,
  config: ConfigSincronizable
): { errores: string[] } {
  const errores: string[] = []

  if (config.nombre?.trim()) actualizarNombreEstacionamiento(db, estacionamientoId, config.nombre)
  actualizarTextoBoleto(db, estacionamientoId, config.textoBoleto)

  // ---- Tipos de vehículo ----
  for (const t of config.tiposVehiculo) {
    if (t.id !== null) continue
    try {
      const creado = crearTipoVehiculo(db, { estacionamientoId, nombre: t.nombre })
      if (t.preciosPorBloque && t.tarifaMaximaDiaria != null) {
        actualizarTarifaProgresiva(db, {
          estacionamientoId,
          tipoVehiculoId: creado.id,
          tarifaMaximaDiaria: t.tarifaMaximaDiaria,
          preciosPorBloque: t.preciosPorBloque
        })
      }
    } catch (error) {
      errores.push(`Tipo de vehículo "${t.nombre}": ${mensajeError(error)}`)
    }
  }

  for (const t of config.tiposVehiculo) {
    if (t.id === null || !t.eliminar) continue
    try {
      eliminarTipoVehiculo(db, t.id)
    } catch (error) {
      errores.push(`Eliminar tipo de vehículo "${t.nombre}": ${mensajeError(error)}`)
    }
  }

  const tiposActuales = listarTiposVehiculoAdmin(db, estacionamientoId)
  for (const t of config.tiposVehiculo) {
    if (t.id === null || t.eliminar) continue
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

  // ---- Tarifas planas ----
  // No existe (ni debe existir) un borrado real: se versionan para no
  // alterar boletos ya cobrados con una versión vieja (ver
  // cambiarPrecioTarifaPlana). "eliminar" aquí es desactivarla — mismo
  // efecto que ya tiene actualizarTarifaPlana(..., activo: false).
  for (const p of config.tarifasPlanas) {
    if (p.id !== null) continue
    try {
      const tipoValido = listarTiposVehiculoAdmin(db, estacionamientoId).some((t) => t.id === p.tipoVehiculoId)
      if (!tipoValido) {
        throw new Error('el tipo de vehículo no existe (créalo primero y guarda de nuevo)')
      }
      crearTarifaPlana(db, {
        estacionamientoId,
        tipoVehiculoId: p.tipoVehiculoId,
        nombre: p.nombre,
        precioFijo: p.precioFijo,
        horasIncluidas: p.horasIncluidas
      })
    } catch (error) {
      errores.push(`Tarifa plana "${p.nombre}": ${mensajeError(error)}`)
    }
  }

  const planasActuales = listarTarifasPlanas(db, estacionamientoId)
  for (const p of config.tarifasPlanas) {
    if (p.id === null) continue
    const actual = planasActuales.find((x) => x.id === p.id)
    if (!actual) continue

    if (p.eliminar) {
      actualizarTarifaPlana(db, { id: p.id, nombre: actual.nombre, activo: false })
      continue
    }

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

  // ---- Series de folio ----
  for (const s of config.series) {
    if (s.id !== null) continue
    try {
      crearSerie(db, { estacionamientoId, serie: s.serie, proporcion: s.proporcion })
    } catch (error) {
      errores.push(`Serie "${s.serie}": ${mensajeError(error)}`)
    }
  }

  for (const s of config.series) {
    if (s.id === null || !s.eliminar) continue
    try {
      eliminarSerie(db, s.id)
    } catch (error) {
      errores.push(`Eliminar serie "${s.serie}": ${mensajeError(error)}`)
    }
  }

  const seriesActuales = listarSeries(db, estacionamientoId)
  for (const s of config.series) {
    if (s.id === null || s.eliminar) continue
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

  return { errores }
}

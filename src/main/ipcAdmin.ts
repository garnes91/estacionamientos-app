import { BrowserWindow, ipcMain } from 'electron'
import { obtenerDb } from './db'
import { requerirAdmin } from './auth'
import { actualizarNombreEstacionamiento, actualizarTextoBoleto } from '../db/estacionamientos'
import {
  actualizarTipoVehiculo,
  crearTipoVehiculo,
  eliminarTipoVehiculo,
  listarTiposVehiculoAdmin,
  reordenarTiposVehiculo
} from '../db/tiposVehiculo'
import { actualizarTarifaProgresiva, obtenerTarifaProgresivaActivaPorTipo } from '../db/tarifas'
import { actualizarSerie, crearSerie, eliminarSerie, establecerSiguienteNumero, listarSeries } from '../db/series'
import {
  actualizarTarifaPlana,
  cambiarPrecioTarifaPlana,
  crearTarifaPlana,
  listarTarifasPlanas
} from '../db/tarifasPlanas'
import { actualizarUsuario, cambiarPassword, crearUsuario, listarUsuarios } from '../db/usuarios'
import { ConfiguracionCorreo, guardarConfiguracionCorreo, obtenerConfiguracionCorreo } from '../db/configuracionCorreo'
import {
  ConfiguracionImpresion,
  guardarConfiguracionImpresion,
  obtenerConfiguracionImpresion
} from '../db/configuracionImpresion'
import {
  ConfiguracionMonitoreo,
  guardarConfiguracionMonitoreo,
  obtenerConfiguracionMonitoreo
} from '../db/configuracionMonitoreo'

/** Canales IPC exclusivos de la pantalla de configuración: todos exigen sesión de admin. */
export function registrarIpcAdmin(): void {
  ipcMain.handle('admin:tiposVehiculo:listar', (_evento, estacionamientoId: number) => {
    requerirAdmin()
    return listarTiposVehiculoAdmin(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle('admin:tiposVehiculo:crear', (_evento, params: { estacionamientoId: number; nombre: string }) => {
    requerirAdmin()
    return crearTipoVehiculo(obtenerDb(), params)
  })

  ipcMain.handle(
    'admin:tiposVehiculo:actualizar',
    (_evento, params: { id: number; nombre: string; activo: boolean }) => {
      requerirAdmin()
      actualizarTipoVehiculo(obtenerDb(), params)
    }
  )

  ipcMain.handle(
    'admin:tiposVehiculo:reordenar',
    (_evento, params: { estacionamientoId: number; ordenIds: number[] }) => {
      requerirAdmin()
      reordenarTiposVehiculo(obtenerDb(), params.estacionamientoId, params.ordenIds)
    }
  )

  ipcMain.handle('admin:tiposVehiculo:eliminar', (_evento, id: number) => {
    requerirAdmin()
    eliminarTipoVehiculo(obtenerDb(), id)
  })

  ipcMain.handle('admin:tarifas:obtenerActivaPorTipo', (_evento, tipoVehiculoId: number) => {
    requerirAdmin()
    return obtenerTarifaProgresivaActivaPorTipo(obtenerDb(), tipoVehiculoId)
  })

  ipcMain.handle(
    'admin:tarifas:actualizar',
    (
      _evento,
      params: {
        estacionamientoId: number
        tipoVehiculoId: number
        tarifaMaximaDiaria: number
        preciosPorBloque: number[]
      }
    ) => {
      requerirAdmin()
      return actualizarTarifaProgresiva(obtenerDb(), params)
    }
  )

  ipcMain.handle('admin:series:listar', (_evento, estacionamientoId: number) => {
    requerirAdmin()
    return listarSeries(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle('admin:series:actualizar', (_evento, params: { id: number; proporcion: number; activo: boolean }) => {
    requerirAdmin()
    actualizarSerie(obtenerDb(), params)
  })

  ipcMain.handle(
    'admin:series:crear',
    (_evento, params: { estacionamientoId: number; serie: string; proporcion: number }) => {
      requerirAdmin()
      return crearSerie(obtenerDb(), params)
    }
  )

  ipcMain.handle('admin:series:eliminar', (_evento, id: number) => {
    requerirAdmin()
    eliminarSerie(obtenerDb(), id)
  })

  ipcMain.handle('admin:series:establecerSiguienteNumero', (_evento, params: { id: number; siguienteNumero: number }) => {
    requerirAdmin()
    establecerSiguienteNumero(obtenerDb(), params.id, params.siguienteNumero)
  })

  ipcMain.handle(
    'admin:estacionamiento:actualizarTextoBoleto',
    (_evento, params: { estacionamientoId: number; texto: string | null }) => {
      requerirAdmin()
      actualizarTextoBoleto(obtenerDb(), params.estacionamientoId, params.texto)
    }
  )

  ipcMain.handle(
    'admin:estacionamiento:actualizarNombre',
    (_evento, params: { estacionamientoId: number; nombre: string }) => {
      requerirAdmin()
      actualizarNombreEstacionamiento(obtenerDb(), params.estacionamientoId, params.nombre)
    }
  )

  ipcMain.handle('admin:tarifasPlanas:listar', (_evento, estacionamientoId: number) => {
    requerirAdmin()
    return listarTarifasPlanas(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle(
    'admin:tarifasPlanas:crear',
    (
      _evento,
      params: { estacionamientoId: number; tipoVehiculoId: number; nombre: string; precioFijo: number; horasIncluidas: number }
    ) => {
      requerirAdmin()
      return crearTarifaPlana(obtenerDb(), params)
    }
  )

  ipcMain.handle(
    'admin:tarifasPlanas:actualizar',
    (_evento, params: { id: number; nombre: string; activo: boolean }) => {
      requerirAdmin()
      actualizarTarifaPlana(obtenerDb(), params)
    }
  )

  ipcMain.handle(
    'admin:tarifasPlanas:cambiarPrecio',
    (
      _evento,
      params: {
        id: number
        estacionamientoId: number
        tipoVehiculoId: number
        nombre: string
        precioFijo: number
        horasIncluidas: number
      }
    ) => {
      requerirAdmin()
      return cambiarPrecioTarifaPlana(obtenerDb(), params)
    }
  )

  ipcMain.handle('admin:usuarios:listar', (_evento, estacionamientoId: number) => {
    requerirAdmin()
    return listarUsuarios(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle(
    'admin:usuarios:crear',
    (
      _evento,
      params: {
        estacionamientoId: number
        nombreUsuario: string
        password: string
        nombreCompleto: string
        rol: 'admin' | 'empleado'
      }
    ) => {
      requerirAdmin()
      return crearUsuario(obtenerDb(), params)
    }
  )

  ipcMain.handle(
    'admin:usuarios:actualizar',
    (_evento, params: { id: number; nombreCompleto: string; rol: 'admin' | 'empleado'; activo: boolean }) => {
      requerirAdmin()
      actualizarUsuario(obtenerDb(), params)
    }
  )

  ipcMain.handle('admin:usuarios:cambiarPassword', (_evento, params: { id: number; password: string }) => {
    requerirAdmin()
    cambiarPassword(obtenerDb(), params.id, params.password)
  })

  ipcMain.handle('admin:correo:obtener', (_evento, estacionamientoId: number) => {
    requerirAdmin()
    return obtenerConfiguracionCorreo(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle(
    'admin:correo:guardar',
    (_evento, params: { estacionamientoId: number; config: ConfiguracionCorreo }) => {
      requerirAdmin()
      guardarConfiguracionCorreo(obtenerDb(), params.estacionamientoId, params.config)
    }
  )

  ipcMain.handle('admin:monitoreo:obtener', (_evento, estacionamientoId: number) => {
    requerirAdmin()
    return obtenerConfiguracionMonitoreo(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle(
    'admin:monitoreo:guardar',
    (_evento, params: { estacionamientoId: number; config: ConfiguracionMonitoreo }) => {
      requerirAdmin()
      guardarConfiguracionMonitoreo(obtenerDb(), params.estacionamientoId, params.config)
    }
  )

  ipcMain.handle('admin:impresion:obtener', (_evento, estacionamientoId: number) => {
    requerirAdmin()
    return obtenerConfiguracionImpresion(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle(
    'admin:impresion:guardar',
    (_evento, params: { estacionamientoId: number; config: ConfiguracionImpresion }) => {
      requerirAdmin()
      guardarConfiguracionImpresion(obtenerDb(), params.estacionamientoId, params.config)
    }
  )

  // Lista los nombres de impresora que Windows/el sistema reconoce, para
  // elegir de un desplegable en vez de tener que escribir el nombre exacto.
  ipcMain.handle('admin:impresion:listarImpresoras', async () => {
    requerirAdmin()
    const ventana = new BrowserWindow({ show: false })
    try {
      await ventana.loadURL('data:text/html,<html></html>')
      const impresoras = await ventana.webContents.getPrintersAsync()
      return impresoras.map((i) => ({ nombre: i.name, nombreVisible: i.displayName }))
    } finally {
      if (!ventana.isDestroyed()) ventana.close()
    }
  })
}

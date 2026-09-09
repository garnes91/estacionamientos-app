import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { cerrarDb, obtenerDb, rutaBaseDeDatos } from './db'
import { requerirAdmin } from './auth'
import {
  exportarRespaldo,
  listarRespaldosAutomaticos,
  respaldoDeSeguridad,
  restaurarDesdeArchivo,
  validarArchivoDeRespaldo
} from './respaldos'
import {
  actualizarCargoBoletoPerdido,
  actualizarNombreEstacionamiento,
  actualizarTextoBoleto,
  actualizarUmbralRecobroSospechoso
} from '../db/estacionamientos'
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
import {
  ConfiguracionFacturacion,
  guardarConfiguracionFacturacion,
  obtenerConfiguracionFacturacion
} from '../db/configuracionFacturacion'
import { listarImpresorasUsb } from './escposUsb'

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

  ipcMain.handle(
    'admin:estacionamiento:actualizarCargoBoletoPerdido',
    (_evento, params: { estacionamientoId: number; monto: number }) => {
      requerirAdmin()
      actualizarCargoBoletoPerdido(obtenerDb(), params.estacionamientoId, params.monto)
    }
  )

  ipcMain.handle(
    'admin:estacionamiento:actualizarUmbralRecobroSospechoso',
    (_evento, params: { estacionamientoId: number; umbral: number }) => {
      requerirAdmin()
      actualizarUmbralRecobroSospechoso(obtenerDb(), params.estacionamientoId, params.umbral)
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

  ipcMain.handle('admin:facturacion:obtener', (_evento, estacionamientoId: number) => {
    requerirAdmin()
    return obtenerConfiguracionFacturacion(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle(
    'admin:facturacion:guardar',
    (_evento, params: { estacionamientoId: number; config: ConfiguracionFacturacion }) => {
      requerirAdmin()
      guardarConfiguracionFacturacion(obtenerDb(), params.estacionamientoId, params.config)
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

  // Lista los dispositivos USB clase "impresora" conectados — para el modo
  // crudo (ESC/POS, ver src/main/escposUsb.ts), que no usa colas de
  // impresión de Windows sino que le habla directo al dispositivo.
  ipcMain.handle('admin:impresion:listarImpresorasUsb', () => {
    requerirAdmin()
    return listarImpresorasUsb()
  })

  // Ver src/main/respaldos.ts: el automático es silencioso (uno por día,
  // en la carpeta de datos de la app); esta lista es solo para que el
  // admin vea que sí están corriendo.
  ipcMain.handle('admin:respaldo:listar', () => {
    requerirAdmin()
    return listarRespaldosAutomaticos(app.getPath('userData'))
  })

  // Respaldo manual: a diferencia del automático (mismo disco que la base
  // real), este sí protege contra que falle el disco completo — el admin
  // elige dónde guardarlo (USB, Google Drive, etc.).
  ipcMain.handle('admin:respaldo:exportar', async () => {
    requerirAdmin()
    const opciones: Electron.SaveDialogOptions = {
      title: 'Guardar respaldo',
      defaultPath: `estacionamientos-respaldo-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Base de datos', extensions: ['db'] }]
    }
    const ventana = BrowserWindow.getFocusedWindow()
    const resultado = ventana ? await dialog.showSaveDialog(ventana, opciones) : await dialog.showSaveDialog(opciones)
    if (resultado.canceled || !resultado.filePath) return null
    await exportarRespaldo(obtenerDb(), resultado.filePath)
    return resultado.filePath
  })

  // Restaurar: la operación más delicada de las tres, porque reemplaza TODA
  // la base viva. Por eso pide confirmación explícita con advertencia y
  // toma un respaldo de seguridad del estado actual antes de tocar nada —
  // ver el orden completo en respaldos.ts. Si todo sale bien, se relanza la
  // app entera en vez de tratar de resetear a mano el estado en memoria
  // (conexión de BD, caches del renderer, heartbeats, etc.). Devuelve false
  // si el admin canceló el diálogo de archivo o la confirmación.
  ipcMain.handle('admin:respaldo:restaurar', async () => {
    requerirAdmin()

    const ventana = BrowserWindow.getFocusedWindow()
    const opcionesArchivo: Electron.OpenDialogOptions = {
      title: 'Elegir archivo de respaldo a restaurar',
      properties: ['openFile'],
      filters: [{ name: 'Base de datos', extensions: ['db'] }]
    }
    const seleccion = ventana
      ? await dialog.showOpenDialog(ventana, opcionesArchivo)
      : await dialog.showOpenDialog(opcionesArchivo)
    if (seleccion.canceled || seleccion.filePaths.length === 0) return false
    const rutaElegida = seleccion.filePaths[0]

    validarArchivoDeRespaldo(rutaElegida)

    const opcionesConfirmacion: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons: ['Cancelar', 'Restaurar y reiniciar'],
      defaultId: 0,
      cancelId: 0,
      title: 'Restaurar respaldo',
      message: 'Esto va a REEMPLAZAR toda la información actual de este estacionamiento.',
      detail:
        'Todos los boletos, tarifas, usuarios y configuración actuales se van a perder y se van a reemplazar por lo que tenga el archivo elegido. Se guarda un respaldo del estado actual antes, por si acaso — pero esta acción no se puede deshacer desde la app. La app se va a reiniciar al terminar.'
    }
    const confirmacion = ventana
      ? await dialog.showMessageBox(ventana, opcionesConfirmacion)
      : await dialog.showMessageBox(opcionesConfirmacion)
    if (confirmacion.response !== 1) return false

    await respaldoDeSeguridad(obtenerDb(), app.getPath('userData'))
    cerrarDb()
    await restaurarDesdeArchivo(rutaElegida, rutaBaseDeDatos())

    app.relaunch()
    app.exit()
    return true
  })
}

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registrarIpc } from './ipc'
import { registrarImpresion } from './print'
import { registrarCorreo } from './email'
import { iniciarLatidos } from './heartbeat'
import { iniciarActualizacionesAutomaticas } from './autoUpdater'
import { cerrarDb, obtenerDb } from './db'
import { respaldarSiHaceFalta } from './respaldos'
import { subirRespaldoNubeSiHaceFalta } from './respaldoNube'
import { sincronizarEstadisticas } from './estadisticasSync'
import { obtenerConfiguracionMonitoreo } from '../db/configuracionMonitoreo'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registrarIpc()
  registrarImpresion()
  registrarCorreo()
  iniciarLatidos()
  iniciarActualizacionesAutomaticas()
  createWindow()

  // Respaldo automático diario de la base de datos — silencioso, no
  // bloquea el arranque; un error aquí (ej. disco lleno) no debe tumbar
  // la app. Ver src/main/respaldos.ts.
  respaldarSiHaceFalta(obtenerDb(), app.getPath('userData'))
    .then(() => {
      // Si está activado (ver src/main/respaldoNube.ts), sube ese mismo
      // respaldo del día a Firebase Storage. Falla aparte del respaldo
      // local: sin internet no debe impedir que el respaldo local se haga.
      const db = obtenerDb()
      const estacionamiento = obtenerEstacionamientoActual(db)
      const config = obtenerConfiguracionMonitoreo(db, estacionamiento.id)
      if (!config) return
      return subirRespaldoNubeSiHaceFalta(app.getPath('userData'), config).catch((error) => {
        console.error('No se pudo subir el respaldo a la nube:', error)
      })
    })
    .catch((error) => {
      console.error('No se pudo hacer el respaldo automático:', error)
    })

  // Sube Corte mensual/Estadísticas al mismo documento del monitoreo en
  // vivo, para que panel-operador los pueda mostrar sin ir a la caseta —
  // ver src/main/estadisticasSync.ts (nunca lanza, no hace falta más aquí).
  sincronizarEstadisticas(obtenerDb(), obtenerEstacionamientoActual(obtenerDb()).id)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Cierra la base de datos ordenadamente (checkpoint del WAL) en vez de
// dejar que el proceso la suelte a la fuerza al salir.
app.on('before-quit', () => {
  cerrarDb()
})

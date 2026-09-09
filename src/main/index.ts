import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registrarIpc } from './ipc'
import { registrarImpresion } from './print'
import { registrarCorreo } from './email'
import { iniciarLatidos } from './heartbeat'
import { iniciarActualizacionesAutomaticas } from './autoUpdater'
import { cerrarDb, obtenerDb } from './db'
import { respaldarSiHaceFalta } from './respaldos'

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
  respaldarSiHaceFalta(obtenerDb(), app.getPath('userData')).catch((error) => {
    console.error('No se pudo hacer el respaldo automático:', error)
  })

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

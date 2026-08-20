import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registrarIpc } from './ipc'
import { registrarImpresion } from './print'
import { registrarCorreo } from './email'
import { iniciarLatidos } from './heartbeat'
import { iniciarActualizacionesAutomaticas } from './autoUpdater'

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

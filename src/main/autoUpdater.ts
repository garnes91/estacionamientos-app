import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

const INTERVALO_MS = 4 * 60 * 60 * 1000 // cada 4 horas

// Versión ya descargada y lista para instalar (null si no hay ninguna
// pendiente) — se avisa al renderer para mostrar un banner con un botón.
let actualizacionLista: string | null = null

/**
 * Revisa y descarga actualizaciones solas en segundo plano — se publican
 * como GitHub Releases de este mismo repo (ver "publish" en package.json y
 * el script release:win). La instalación NO es automática: instalar en
 * silencio y solo al cerrar (autoInstallOnAppQuit) resultó poco confiable
 * en la práctica — Windows a veces no soltaba el proceso viejo a tiempo y
 * la instalación silenciosa se rendía ("Fallo al desinstalar archivos
 * antiguos"). En vez de eso, el banner deja que el operador decida cuándo
 * dar el clic para actualizar; ahí se corre el instalador de Windows
 * normal (no silencioso), que si hace falta cerrar algo lo pide de forma
 * visible en vez de rendirse solo. Solo corre en la app empaquetada: en
 * desarrollo (electron-vite dev/preview) no hay instalador que actualizar.
 */
export function iniciarActualizacionesAutomaticas(): void {
  ipcMain.handle('actualizaciones:estado', () => actualizacionLista)

  if (!app.isPackaged) return

  ipcMain.handle('actualizaciones:instalar', () => {
    // isSilent=false: instalador visible, no el modo silencioso que fallaba.
    // isForceRunAfter=true: vuelve a abrir la app sola al terminar.
    autoUpdater.quitAndInstall(false, true)
  })

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.disableDifferentialDownload = true

  autoUpdater.on('error', (error) => {
    // No tumbar la app por un problema de red/GitHub — se reintenta en
    // el siguiente ciclo.
    console.error('[actualizaciones] error:', error)
  })

  autoUpdater.on('update-downloaded', (info) => {
    actualizacionLista = info.version
    for (const ventana of BrowserWindow.getAllWindows()) {
      ventana.webContents.send('actualizaciones:lista', info.version)
    }
  })

  function revisar(): void {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('[actualizaciones] falló la revisión:', error)
    })
  }

  revisar()
  setInterval(revisar, INTERVALO_MS)
}

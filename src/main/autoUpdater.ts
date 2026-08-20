import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

const INTERVALO_MS = 4 * 60 * 60 * 1000 // cada 4 horas

// Versión ya descargada y lista para instalar (null si no hay ninguna
// pendiente) — se avisa al renderer para mostrar un banner informativo,
// pero la instalación en sí sigue siendo automática, no depende de que
// nadie vea ni haga clic en nada.
let actualizacionLista: string | null = null

/**
 * Revisa, descarga e instala actualizaciones solas, sin ningún clic del
 * operador — se publican como GitHub Releases de este mismo repo (ver
 * "publish" en package.json y el script release:win). Se descarga en
 * segundo plano y se instala sola la próxima vez que la app se cierre
 * normalmente (autoInstallOnAppQuit, comportamiento por defecto de
 * electron-updater) — nunca interrumpe un turno en curso. Solo corre en
 * la app empaquetada: en desarrollo (electron-vite dev/preview) no hay
 * instalador que actualizar.
 */
export function iniciarActualizacionesAutomaticas(): void {
  ipcMain.handle('actualizaciones:estado', () => actualizacionLista)

  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

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

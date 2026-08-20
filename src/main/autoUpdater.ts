import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

const INTERVALO_MS = 4 * 60 * 60 * 1000 // cada 4 horas

/**
 * Revisa, descarga e instala actualizaciones solas, sin ningún aviso ni
 * clic del operador — se publican como GitHub Releases de este mismo
 * repo (ver "publish" en package.json y el script release:win). Se
 * descarga en segundo plano y se instala sola la próxima vez que la app
 * se cierre normalmente (autoInstallOnAppQuit, comportamiento por
 * defecto de electron-updater) — nunca interrumpe un turno en curso.
 * Solo corre en la app empaquetada: en desarrollo (electron-vite
 * dev/preview) no hay instalador que actualizar.
 */
export function iniciarActualizacionesAutomaticas(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (error) => {
    // No tumbar la app por un problema de red/GitHub — se reintenta en
    // el siguiente ciclo.
    console.error('[actualizaciones] error:', error)
  })

  function revisar(): void {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('[actualizaciones] falló la revisión:', error)
    })
  }

  revisar()
  setInterval(revisar, INTERVALO_MS)
}

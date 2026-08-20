; El chequeo de "¿la app ya está corriendo?" que trae electron-builder por
; defecto (compara procesos por ruta vía PowerShell) está dando falsos
; positivos en algunas instalaciones de Windows: bloquea la instalación con
; "No se puede cerrar Estacionamientos" aunque la app no esté corriendo (no
; aparece en el Administrador de tareas). Se reemplaza por un no-op — si la
; app SÍ sigue abierta de verdad, Windows simplemente no deja sobrescribir
; el .exe y el instalador falla con el error normal de "archivo en uso",
; igual de seguro, solo sin este chequeo previo que está fallando mal.
!macro customCheckAppRunning
!macroend

; De forma parecida, si al actualizar el instalador nuevo intenta correr el
; desinstalador de la versión anterior y ese desinstalador falla (por el
; mismo tipo de detección equivocada, o cualquier otra razón), el
; instalador por defecto se rinde con "Fallo al desinstalar archivos
; antiguos". No hace falta: los archivos de la versión nueva se van a
; sobrescribir directo de todas formas — así que se ignora el resultado del
; desinstalador viejo y se sigue adelante con la instalación.
!macro customUnInstallCheck
!macroend

!macro customUnInstallCheckCurrentUser
!macroend

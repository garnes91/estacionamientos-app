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

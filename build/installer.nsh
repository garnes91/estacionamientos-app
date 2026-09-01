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

; quitAndInstall cierra la app y lanza este instalador casi al mismo
; tiempo. El diálogo "no se puede cerrar la app" NO viene del chequeo de
; arriba (ya es un no-op) — viene de uninstallOldVersion (interno de
; electron-builder, sin hook público para desactivarlo), que reintenta
; correr el desinstalador de la versión anterior hasta 5 veces y, si el
; .exe viejo sigue bloqueado en todas, muestra ese diálogo. Una pausa fija
; de 2s no bastó en la práctica (probado en una VM con antivirus, donde el
; archivo recién descargado puede seguir bloqueado más tiempo) — en vez de
; adivinar cuánto esperar, se reintenta activamente hasta que Windows
; suelta el .exe (o hasta 20s, por si nunca se libera del todo).
!macro customInit
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 estacionamientos_fin_espera
  StrCpy $R9 0

  estacionamientos_bucle_espera:
    ClearErrors
    FileOpen $R8 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" a
    IfErrors estacionamientos_sigue_bloqueado estacionamientos_archivo_libre

    estacionamientos_sigue_bloqueado:
      IntOp $R9 $R9 + 1
      IntCmp $R9 20 estacionamientos_fin_espera estacionamientos_reintentar estacionamientos_fin_espera
      estacionamientos_reintentar:
        Sleep 1000
        Goto estacionamientos_bucle_espera

    estacionamientos_archivo_libre:
      FileClose $R8

  estacionamientos_fin_espera:
!macroend

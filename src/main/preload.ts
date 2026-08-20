import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  version: () => ipcRenderer.invoke('app:version'),
  actualizaciones: {
    estado: () => ipcRenderer.invoke('actualizaciones:estado'),
    alEstarLista: (callback: (version: string) => void) => {
      const listener = (_evento: unknown, version: string): void => callback(version)
      ipcRenderer.on('actualizaciones:lista', listener)
      return () => ipcRenderer.removeListener('actualizaciones:lista', listener)
    }
  },
  estacionamientoActual: () => ipcRenderer.invoke('estacionamiento:actual'),
  login: (params: { nombreUsuario: string; password: string }) => ipcRenderer.invoke('auth:login', params),
  logout: () => ipcRenderer.invoke('auth:logout'),
  usuarioActual: () => ipcRenderer.invoke('auth:actual'),
  verificarCredenciales: (params: { nombreUsuario: string; password: string }) =>
    ipcRenderer.invoke('auth:verificar', params),
  listarTiposVehiculo: (estacionamientoId: number) => ipcRenderer.invoke('tiposVehiculo:listar', estacionamientoId),
  listarTarifasPlanas: (estacionamientoId: number) => ipcRenderer.invoke('tarifasPlanas:listar', estacionamientoId),
  imprimir: (params: { html: string; tipo: 'ticket' | 'reporte' }) => ipcRenderer.invoke('impresion:imprimir', params),
  emitirBoleto: (params: {
    estacionamientoId: number
    tipoVehiculoId: number
    placa?: string | null
    tarifaPlanaId?: number | null
  }) => ipcRenderer.invoke('boletos:emitir', params),
  listarBoletosAbiertos: (estacionamientoId: number) =>
    ipcRenderer.invoke('boletos:listarAbiertos', estacionamientoId),
  cerrarBoleto: (params: { estacionamientoId: number; boletoId: number }) =>
    ipcRenderer.invoke('boletos:cerrar', params),
  cobrarBoletoPorFolio: (params: { estacionamientoId: number; serie: string; folio: number }) =>
    ipcRenderer.invoke('boletos:cobrarPorFolio', params),
  resumen: (estacionamientoId: number) => ipcRenderer.invoke('boletos:resumen', estacionamientoId),
  modoSoloSerieA: {
    estado: (estacionamientoId: number) => ipcRenderer.invoke('modoSoloSerieA:estado', estacionamientoId),
    alternar: (estacionamientoId: number) => ipcRenderer.invoke('modoSoloSerieA:alternar', estacionamientoId)
  },
  cortes: {
    hacer: (estacionamientoId: number) => ipcRenderer.invoke('cortes:hacer', estacionamientoId),
    listar: (estacionamientoId: number) => ipcRenderer.invoke('cortes:listar', estacionamientoId),
    detalle: (corteId: number) => ipcRenderer.invoke('cortes:detalle', corteId),
    enviarPorCorreo: (params: { corteId: number; htmlReporte: string }) =>
      ipcRenderer.invoke('correo:enviarCorte', params)
  },

  admin: {
    tiposVehiculo: {
      listar: (estacionamientoId: number) => ipcRenderer.invoke('admin:tiposVehiculo:listar', estacionamientoId),
      crear: (params: { estacionamientoId: number; nombre: string }) =>
        ipcRenderer.invoke('admin:tiposVehiculo:crear', params),
      actualizar: (params: { id: number; nombre: string; activo: boolean }) =>
        ipcRenderer.invoke('admin:tiposVehiculo:actualizar', params),
      reordenar: (params: { estacionamientoId: number; ordenIds: number[] }) =>
        ipcRenderer.invoke('admin:tiposVehiculo:reordenar', params),
      eliminar: (id: number) => ipcRenderer.invoke('admin:tiposVehiculo:eliminar', id)
    },
    tarifas: {
      obtenerActivaPorTipo: (tipoVehiculoId: number) =>
        ipcRenderer.invoke('admin:tarifas:obtenerActivaPorTipo', tipoVehiculoId),
      actualizar: (params: {
        estacionamientoId: number
        tipoVehiculoId: number
        tarifaMaximaDiaria: number
        preciosPorBloque: number[]
      }) => ipcRenderer.invoke('admin:tarifas:actualizar', params)
    },
    series: {
      listar: (estacionamientoId: number) => ipcRenderer.invoke('admin:series:listar', estacionamientoId),
      actualizar: (params: { id: number; proporcion: number; activo: boolean }) =>
        ipcRenderer.invoke('admin:series:actualizar', params),
      crear: (params: { estacionamientoId: number; serie: string; proporcion: number }) =>
        ipcRenderer.invoke('admin:series:crear', params),
      eliminar: (id: number) => ipcRenderer.invoke('admin:series:eliminar', id),
      establecerSiguienteNumero: (params: { id: number; siguienteNumero: number }) =>
        ipcRenderer.invoke('admin:series:establecerSiguienteNumero', params)
    },
    estacionamiento: {
      actualizarTextoBoleto: (params: { estacionamientoId: number; texto: string | null }) =>
        ipcRenderer.invoke('admin:estacionamiento:actualizarTextoBoleto', params),
      actualizarNombre: (params: { estacionamientoId: number; nombre: string }) =>
        ipcRenderer.invoke('admin:estacionamiento:actualizarNombre', params)
    },
    tarifasPlanas: {
      listar: (estacionamientoId: number) => ipcRenderer.invoke('admin:tarifasPlanas:listar', estacionamientoId),
      crear: (params: {
        estacionamientoId: number
        tipoVehiculoId: number
        nombre: string
        precioFijo: number
        horasIncluidas: number
      }) => ipcRenderer.invoke('admin:tarifasPlanas:crear', params),
      actualizar: (params: { id: number; nombre: string; activo: boolean }) =>
        ipcRenderer.invoke('admin:tarifasPlanas:actualizar', params),
      cambiarPrecio: (params: {
        id: number
        estacionamientoId: number
        tipoVehiculoId: number
        nombre: string
        precioFijo: number
        horasIncluidas: number
      }) => ipcRenderer.invoke('admin:tarifasPlanas:cambiarPrecio', params)
    },
    usuarios: {
      listar: (estacionamientoId: number) => ipcRenderer.invoke('admin:usuarios:listar', estacionamientoId),
      crear: (params: {
        estacionamientoId: number
        nombreUsuario: string
        password: string
        nombreCompleto: string
        rol: 'admin' | 'empleado'
      }) => ipcRenderer.invoke('admin:usuarios:crear', params),
      actualizar: (params: { id: number; nombreCompleto: string; rol: 'admin' | 'empleado'; activo: boolean }) =>
        ipcRenderer.invoke('admin:usuarios:actualizar', params),
      cambiarPassword: (params: { id: number; password: string }) =>
        ipcRenderer.invoke('admin:usuarios:cambiarPassword', params)
    },
    correo: {
      obtener: (estacionamientoId: number) => ipcRenderer.invoke('admin:correo:obtener', estacionamientoId),
      guardar: (params: {
        estacionamientoId: number
        config: {
          host: string
          puerto: number
          seguro: boolean
          usuario: string
          password: string
          remitente: string
          destinatarios: string
        }
      }) => ipcRenderer.invoke('admin:correo:guardar', params),
      probarConexion: (config: {
        host: string
        puerto: number
        seguro: boolean
        usuario: string
        password: string
        remitente: string
        destinatarios: string
      }) => ipcRenderer.invoke('correo:probarConexion', config)
    },
    monitoreo: {
      obtener: (estacionamientoId: number) => ipcRenderer.invoke('admin:monitoreo:obtener', estacionamientoId),
      guardar: (params: {
        estacionamientoId: number
        config: { habilitado: boolean; apiKey: string; projectId: string; slug: string }
      }) => ipcRenderer.invoke('admin:monitoreo:guardar', params),
      probar: (config: { habilitado: boolean; apiKey: string; projectId: string; slug: string }) =>
        ipcRenderer.invoke('monitoreo:probar', config)
    },
    impresion: {
      obtener: (estacionamientoId: number) => ipcRenderer.invoke('admin:impresion:obtener', estacionamientoId),
      guardar: (params: {
        estacionamientoId: number
        config: { impresoraTicket: string | null; impresoraReporte: string | null }
      }) => ipcRenderer.invoke('admin:impresion:guardar', params),
      listarImpresoras: () => ipcRenderer.invoke('admin:impresion:listarImpresoras')
    }
  }
})

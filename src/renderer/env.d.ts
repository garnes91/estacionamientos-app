export {}

interface TipoVehiculoApi {
  id: number
  nombre: string
}

interface TipoVehiculoAdminApi {
  id: number
  nombre: string
  orden: number
  activo: boolean
}

interface BoletoEmitidoApi {
  id: number
  serie: string
  folio: number
  tipoVehiculoId: number
  horaEntrada: string
  tarifaPlanaId: number | null
}

interface BoletoListadoApi {
  id: number
  serie: string
  folio: number
  tipoVehiculo: string
  placa: string | null
  horaEntrada: string
  estado: string
}

interface BoletoCerradoApi {
  id: number
  serie: string
  folio: number
  minutosTotales: number
  tipoCobro: 'regular' | 'plana'
  monto: number
  excedenteMinutos?: number
  excedenteMonto?: number
}

interface UsuarioApi {
  id: number
  nombreCompleto: string
  rol: 'admin' | 'empleado'
}

interface TarifaProgresivaAdminApi {
  id: number
  tarifaMaximaDiaria: number
  preciosPorBloque: number[]
}

interface SerieFolioAdminApi {
  id: number
  serie: string
  proporcion: number
  siguienteNumero: number
  contadorEmitidos: number
  activo: boolean
}

interface TarifaPlanaAdminApi {
  id: number
  tipoVehiculoId: number
  nombre: string
  precioFijo: number
  horasIncluidas: number
  activo: boolean
}

interface UsuarioAdminApi {
  id: number
  nombreUsuario: string
  nombreCompleto: string
  rol: 'admin' | 'empleado'
  activo: boolean
}

interface ResumenApi {
  entradasDesdeUltimoCorte: number
  actualmenteDentro: number
}

interface CorteApi {
  id: number
  desde: string
  hasta: string
  totalBoletos: number
  totalMonto: number
  usuarioId: number
}

interface DetalleCorteBoletoApi {
  id: number
  serie: string
  folio: number
  tipoVehiculo: string
  horaEntrada: string
  horaSalida: string
  monto: number
}

interface DetalleCortePorSerieApi {
  serie: string
  boletos: DetalleCorteBoletoApi[]
  totalBoletos: number
  totalMonto: number
}

interface DetalleCorteApi extends CorteApi {
  porTipoVehiculo: { tipoVehiculo: string; boletos: number; monto: number }[]
  porSerie: DetalleCortePorSerieApi[]
}

interface ConfiguracionCorreoApi {
  host: string
  puerto: number
  seguro: boolean
  usuario: string
  password: string
  remitente: string
  destinatarios: string
}

interface ConfiguracionMonitoreoApi {
  habilitado: boolean
  apiKey: string
  projectId: string
  slug: string
}

interface ConfiguracionImpresionApi {
  impresoraTicket: string | null
  impresoraReporte: string | null
}

interface ImpresoraApi {
  nombre: string
  nombreVisible: string
}

declare global {
  interface Window {
    api: {
      estacionamientoActual: () => Promise<{
        id: number
        nombre: string
        textoBoleto: string | null
        claveFolio: string
      }>
      login: (params: { nombreUsuario: string; password: string }) => Promise<UsuarioApi>
      logout: () => Promise<void>
      usuarioActual: () => Promise<UsuarioApi | null>
      verificarCredenciales: (params: { nombreUsuario: string; password: string }) => Promise<UsuarioApi>
      listarTiposVehiculo: (estacionamientoId: number) => Promise<TipoVehiculoApi[]>
      listarTarifasPlanas: (estacionamientoId: number) => Promise<TarifaPlanaAdminApi[]>
      imprimir: (params: { html: string; tipo: 'ticket' | 'reporte' }) => Promise<void>
      emitirBoleto: (params: {
        estacionamientoId: number
        tipoVehiculoId: number
        placa?: string | null
        tarifaPlanaId?: number | null
      }) => Promise<BoletoEmitidoApi>
      listarBoletosAbiertos: (estacionamientoId: number) => Promise<BoletoListadoApi[]>
      cerrarBoleto: (params: { estacionamientoId: number; boletoId: number }) => Promise<BoletoCerradoApi>
      cobrarBoletoPorFolio: (params: {
        estacionamientoId: number
        serie: string
        folio: number
      }) => Promise<BoletoCerradoApi>
      resumen: (estacionamientoId: number) => Promise<ResumenApi>
      modoSoloSerieA: {
        estado: (estacionamientoId: number) => Promise<boolean>
        alternar: (estacionamientoId: number) => Promise<boolean>
      }
      cortes: {
        hacer: (estacionamientoId: number) => Promise<CorteApi>
        listar: (estacionamientoId: number) => Promise<CorteApi[]>
        detalle: (corteId: number) => Promise<DetalleCorteApi>
        enviarPorCorreo: (params: { corteId: number; htmlReporte: string }) => Promise<void>
      }

      admin: {
        tiposVehiculo: {
          listar: (estacionamientoId: number) => Promise<TipoVehiculoAdminApi[]>
          crear: (params: { estacionamientoId: number; nombre: string }) => Promise<TipoVehiculoAdminApi>
          actualizar: (params: { id: number; nombre: string; activo: boolean }) => Promise<void>
          reordenar: (params: { estacionamientoId: number; ordenIds: number[] }) => Promise<void>
          eliminar: (id: number) => Promise<void>
        }
        tarifas: {
          obtenerActivaPorTipo: (tipoVehiculoId: number) => Promise<TarifaProgresivaAdminApi | null>
          actualizar: (params: {
            estacionamientoId: number
            tipoVehiculoId: number
            tarifaMaximaDiaria: number
            preciosPorBloque: number[]
          }) => Promise<TarifaProgresivaAdminApi>
        }
        series: {
          listar: (estacionamientoId: number) => Promise<SerieFolioAdminApi[]>
          actualizar: (params: { id: number; proporcion: number; activo: boolean }) => Promise<void>
          crear: (params: { estacionamientoId: number; serie: string; proporcion: number }) => Promise<SerieFolioAdminApi>
          eliminar: (id: number) => Promise<void>
          establecerSiguienteNumero: (params: { id: number; siguienteNumero: number }) => Promise<void>
        }
        estacionamiento: {
          actualizarTextoBoleto: (params: { estacionamientoId: number; texto: string | null }) => Promise<void>
          actualizarNombre: (params: { estacionamientoId: number; nombre: string }) => Promise<void>
        }
        tarifasPlanas: {
          listar: (estacionamientoId: number) => Promise<TarifaPlanaAdminApi[]>
          crear: (params: {
            estacionamientoId: number
            tipoVehiculoId: number
            nombre: string
            precioFijo: number
            horasIncluidas: number
          }) => Promise<TarifaPlanaAdminApi>
          actualizar: (params: { id: number; nombre: string; activo: boolean }) => Promise<void>
          cambiarPrecio: (params: {
            id: number
            estacionamientoId: number
            tipoVehiculoId: number
            nombre: string
            precioFijo: number
            horasIncluidas: number
          }) => Promise<TarifaPlanaAdminApi>
        }
        usuarios: {
          listar: (estacionamientoId: number) => Promise<UsuarioAdminApi[]>
          crear: (params: {
            estacionamientoId: number
            nombreUsuario: string
            password: string
            nombreCompleto: string
            rol: 'admin' | 'empleado'
          }) => Promise<UsuarioAdminApi>
          actualizar: (params: {
            id: number
            nombreCompleto: string
            rol: 'admin' | 'empleado'
            activo: boolean
          }) => Promise<void>
          cambiarPassword: (params: { id: number; password: string }) => Promise<void>
        }
        correo: {
          obtener: (estacionamientoId: number) => Promise<ConfiguracionCorreoApi | null>
          guardar: (params: { estacionamientoId: number; config: ConfiguracionCorreoApi }) => Promise<void>
          probarConexion: (config: ConfiguracionCorreoApi) => Promise<void>
        }
        monitoreo: {
          obtener: (estacionamientoId: number) => Promise<ConfiguracionMonitoreoApi | null>
          guardar: (params: { estacionamientoId: number; config: ConfiguracionMonitoreoApi }) => Promise<void>
          probar: (config: ConfiguracionMonitoreoApi) => Promise<void>
        }
        impresion: {
          obtener: (estacionamientoId: number) => Promise<ConfiguracionImpresionApi | null>
          guardar: (params: { estacionamientoId: number; config: ConfiguracionImpresionApi }) => Promise<void>
          listarImpresoras: () => Promise<ImpresoraApi[]>
        }
      }
    }
  }
}

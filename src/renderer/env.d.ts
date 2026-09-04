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
  horaSalida: string
  minutosTotales: number
  tipoCobro: 'regular' | 'plana'
  monto: number
  excedenteMinutos?: number
  excedenteMonto?: number
  recargoBoletoPerdido?: number
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
  pensionadosPagosCantidad: number
  pensionadosPagosMonto: number
  gastosEfectivoCantidad: number
  gastosEfectivoMonto: number
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
  desde: string
  hasta: string
  boletos: DetalleCorteBoletoApi[]
  totalBoletos: number
  totalMonto: number
}

interface DetalleCortePensionadoPagoApi {
  id: number
  pensionadoNombre: string
  monto: number
  periodoDesde: string
  periodoHasta: string
  fechaPago: string
}

interface DetalleCortePensionadoEventoApi {
  id: number
  nombre: string
  fecha: string
}

interface DetalleCorteApi extends CorteApi {
  porTipoVehiculo: { tipoVehiculo: string; boletos: number; monto: number }[]
  porSerie: DetalleCortePorSerieApi[]
  pagosPensionados: DetalleCortePensionadoPagoApi[]
  altasPensionados: DetalleCortePensionadoEventoApi[]
  bajasPensionados: DetalleCortePensionadoEventoApi[]
  gastosDelPeriodo: GastoApi[]
}

interface PensionadoApi {
  id: number
  nombre: string
  telefono: string | null
  placa: string | null
  tipoVehiculoId: number
  tipoVehiculo: string
  cuotaMensual: number
  fechaAlta: string
  estado: 'activo' | 'baja'
  fechaBaja: string | null
  vigenteHasta: string
}

interface PagoPensionadoApi {
  id: number
  pensionadoId: number
  periodoDesde: string
  periodoHasta: string
  monto: number
}

interface PeriodoSugeridoApi {
  periodoDesde: string
  periodoHasta: string
}

type CategoriaGastoApi = 'operativo' | 'nomina' | 'servicios' | 'otro'
type FormaPagoGastoApi = 'efectivo' | 'transferencia' | 'otro'

interface GastoApi {
  id: number
  concepto: string
  categoria: CategoriaGastoApi
  monto: number
  formaPago: FormaPagoGastoApi
  fecha: string
  usuarioId: number
}

interface ResumenGastosPorCategoriaApi {
  categoria: CategoriaGastoApi
  cantidad: number
  monto: number
}

interface CorteMensualApi {
  anio: number
  mes: number
  desde: string
  hasta: string
  totalBoletos: number
  totalMonto: number
  pensionadosPagosCantidad: number
  pensionadosPagosMonto: number
  pagosPensionados: DetalleCortePensionadoPagoApi[]
  altasPensionados: DetalleCortePensionadoEventoApi[]
  bajasPensionados: DetalleCortePensionadoEventoApi[]
  gastosEfectivoCantidad: number
  gastosEfectivoMonto: number
  gastosPorCategoria: ResumenGastosPorCategoriaApi[]
  totalEnCaja: number
  cortesDelMes: CorteApi[]
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
  ticketModoCrudo: boolean
  ticketUsbVendorId: number | null
  ticketUsbProductId: number | null
  ticketImpresoraCompartida: string | null
}

interface ImpresoraUsbApi {
  vendorId: number
  productId: number
  nombre: string
}

interface ConfiguracionFacturacionApi {
  habilitado: boolean
  rfc: string
  razonSocial: string
  regimenFiscal: string
  codigoPostalFiscal: string
  claveProductoServicio: string
  claveUnidad: string
}

interface ImpresoraApi {
  nombre: string
  nombreVisible: string
}

declare global {
  interface Window {
    api: {
      version: () => Promise<string>
      plataforma: NodeJS.Platform
      actualizaciones: {
        estado: () => Promise<string | null>
        instalar: () => Promise<void>
        alEstarLista: (callback: (version: string) => void) => () => void
      }
      estacionamientoActual: () => Promise<{
        id: number
        nombre: string
        textoBoleto: string | null
        cargoBoletoPerdido: number
        claveFolio: string
      }>
      login: (params: { nombreUsuario: string; password: string }) => Promise<UsuarioApi>
      logout: () => Promise<void>
      usuarioActual: () => Promise<UsuarioApi | null>
      verificarCredenciales: (params: { nombreUsuario: string; password: string }) => Promise<UsuarioApi>
      listarTiposVehiculo: (estacionamientoId: number) => Promise<TipoVehiculoApi[]>
      listarTarifasPlanas: (estacionamientoId: number) => Promise<TarifaPlanaAdminApi[]>
      imprimir: (params: {
        html: string
        tipo: 'ticket' | 'reporte'
        datosTicket?:
          | {
              variante: 'entrada'
              claveFolio: string
              datos: {
                estacionamientoNombre: string
                textoBoleto: string | null
                serie: string
                folio: number
                tipoVehiculo: string
                placa: string | null
                horaEntrada: string
                tarifaPlana?: { nombre: string; precioFijo: number; horasIncluidas: number } | null
              }
            }
          | {
              variante: 'cobro'
              claveFolio: string
              datos: {
                estacionamientoNombre: string
                textoBoleto: string | null
                serie: string
                folio: number
                tipoCobro: 'regular' | 'plana'
                minutosTotales: number
                monto: number
                excedenteMinutos?: number
                excedenteMonto?: number
                recargoBoletoPerdido?: number
              }
            }
          | {
              variante: 'pensionado'
              datos: {
                tipo: 'alta' | 'baja' | 'pago'
                folio: number
                estacionamientoNombre: string
                nombre: string
                placa: string | null
                tipoVehiculo: string
                fecha: string
                cuotaMensual?: number
                monto?: number
                periodoDesde?: string
                periodoHasta?: string
              }
            }
        datosReporte?:
          | {
              variante: 'general'
              datos: {
                estacionamientoNombre: string
                generadoPor: string
                soloSerieA: boolean
                desde: string
                hasta: string
                porTipoVehiculo: { tipoVehiculo: string; boletos: number; monto: number }[]
                altasPensionados: string[]
                bajasPensionados: string[]
                pagosPensionados: { pensionadoNombre: string; monto: number }[]
                gastosDelPeriodo: { concepto: string; monto: number }[]
                totalBoletos: number
                totalMonto: number
                pensionadosPagosCantidad: number
                pensionadosPagosMonto: number
                gastosEfectivoCantidad: number
                gastosEfectivoMonto: number
              }
            }
          | {
              variante: 'serie'
              claveFolio: string
              datos: {
                estacionamientoNombre: string
                generadoPor: string
                serie: string
                desde: string
                hasta: string
                boletos: {
                  serie: string
                  folio: number
                  tipoVehiculo: string
                  horaEntrada: string
                  horaSalida: string
                  monto: number
                }[]
                totalBoletos: number
                totalMonto: number
              }
            }
          | {
              variante: 'mensual'
              datos: {
                estacionamientoNombre: string
                anio: number
                mes: number
                totalBoletos: number
                totalMonto: number
                pensionadosPagosCantidad: number
                pensionadosPagosMonto: number
                altasPensionados: string[]
                bajasPensionados: string[]
                gastosEfectivoCantidad: number
                gastosEfectivoMonto: number
                gastosPorCategoria: { categoria: string; cantidad: number; monto: number }[]
                totalEnCaja: number
                cortesDelMes: { hasta: string; totalBoletos: number; totalMonto: number }[]
              }
            }
      }) => Promise<void>
      emitirBoleto: (params: {
        estacionamientoId: number
        tipoVehiculoId: number
        placa?: string | null
        tarifaPlanaId?: number | null
      }) => Promise<BoletoEmitidoApi>
      listarBoletosAbiertos: (estacionamientoId: number) => Promise<BoletoListadoApi[]>
      cerrarBoleto: (params: { estacionamientoId: number; boletoId: number }) => Promise<BoletoCerradoApi>
      cerrarBoletoPerdido: (params: { estacionamientoId: number; boletoId: number }) => Promise<BoletoCerradoApi>
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
        mensual: (params: { estacionamientoId: number; anio: number; mes: number }) => Promise<CorteMensualApi>
        enviarPorCorreo: (params: { corteId: number; htmlReporte: string }) => Promise<void>
      }
      pensionados: {
        listar: (params: { estacionamientoId: number; incluirBajas?: boolean }) => Promise<PensionadoApi[]>
        crear: (params: {
          estacionamientoId: number
          nombre: string
          telefono?: string | null
          placa?: string | null
          tipoVehiculoId: number
          cuotaMensual: number
        }) => Promise<PensionadoApi>
        darDeBaja: (id: number) => Promise<void>
        registrarPago: (params: {
          pensionadoId: number
          periodoDesde: string
          periodoHasta: string
          monto: number
        }) => Promise<PagoPensionadoApi>
        sugerirSiguientePeriodo: (pensionadoId: number) => Promise<PeriodoSugeridoApi>
      }
      gastos: {
        listar: (params: { estacionamientoId: number; desde?: string; hasta?: string }) => Promise<GastoApi[]>
        registrar: (params: {
          estacionamientoId: number
          concepto: string
          categoria: CategoriaGastoApi
          monto: number
          formaPago: FormaPagoGastoApi
          fecha: string
        }) => Promise<GastoApi>
        eliminar: (id: number) => Promise<void>
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
          actualizarCargoBoletoPerdido: (params: { estacionamientoId: number; monto: number }) => Promise<void>
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
          listarImpresorasUsb: () => Promise<ImpresoraUsbApi[]>
        }
        facturacion: {
          obtener: (estacionamientoId: number) => Promise<ConfiguracionFacturacionApi | null>
          guardar: (params: { estacionamientoId: number; config: ConfiguracionFacturacionApi }) => Promise<void>
        }
      }
    }
  }
}

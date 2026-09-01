import { app, ipcMain } from 'electron'
import { obtenerDb } from './db'
import { establecerUsuarioActual, obtenerUsuarioActual, requerirUsuarioActual } from './auth'
import { obtenerEstacionamientoActual } from '../db/estacionamientos'
import { listarTiposVehiculo } from '../db/tiposVehiculo'
import { autenticar } from '../db/usuarios'
import { listarTarifasPlanas } from '../db/tarifasPlanas'
import {
  cerrarBoleto,
  cobrarBoletoPorFolio,
  emitirBoleto,
  listarBoletosAbiertos,
  obtenerResumen
} from '../db/boletos'
import { hacerCorte, listarCortes, obtenerDetalleCorte } from '../db/cortes'
import { obtenerCorteMensual } from '../db/corteMensual'
import { alternarModoSoloSerieA, obtenerModoSoloSerieA } from '../db/modoSoloSerieA'
import { obtenerOCrearClaveFolio } from '../db/claveCifradoFolio'
import {
  crearPensionado,
  darDeBajaPensionado,
  listarPensionados,
  registrarPago,
  sugerirSiguientePeriodo
} from '../db/pensionados'
import { CategoriaGasto, eliminarGasto, FormaPagoGasto, listarGastos, registrarGasto } from '../db/gastos'
import { registrarIpcAdmin } from './ipcAdmin'
import { sincronizarBoletoCerrado } from './facturacionSync'

/** Registra los canales IPC que el renderer usa vía window.api (ver preload.ts). */
export function registrarIpc(): void {
  registrarIpcAdmin()
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('estacionamiento:actual', () => {
    const db = obtenerDb()
    const estacionamiento = obtenerEstacionamientoActual(db)
    return { ...estacionamiento, claveFolio: obtenerOCrearClaveFolio(db, estacionamiento.id) }
  })

  ipcMain.handle('auth:login', (_evento, params: { nombreUsuario: string; password: string }) => {
    const db = obtenerDb()
    const estacionamiento = obtenerEstacionamientoActual(db)
    const usuario = autenticar(db, estacionamiento.id, params.nombreUsuario, params.password)
    if (!usuario) {
      throw new Error('Usuario o contraseña incorrectos')
    }
    establecerUsuarioActual(usuario)
    return usuario
  })

  ipcMain.handle('auth:logout', () => {
    establecerUsuarioActual(null)
  })

  // Re-confirma credenciales sin tocar la sesión activa (para gatear
  // pantallas sensibles, ej. corte de caja, sin desloguear al operador).
  ipcMain.handle('auth:verificar', (_evento, params: { nombreUsuario: string; password: string }) => {
    const db = obtenerDb()
    const estacionamiento = obtenerEstacionamientoActual(db)
    const usuario = autenticar(db, estacionamiento.id, params.nombreUsuario, params.password)
    if (!usuario) {
      throw new Error('Usuario o contraseña incorrectos')
    }
    return usuario
  })

  ipcMain.handle('auth:actual', () => {
    return obtenerUsuarioActual()
  })

  ipcMain.handle('tiposVehiculo:listar', (_evento, estacionamientoId: number) => {
    return listarTiposVehiculo(obtenerDb(), estacionamientoId)
  })

  // Disponible para cualquier sesión (no solo admin): el empleado necesita
  // ver las tarifas planas vigentes para ofrecerlas al emitir.
  ipcMain.handle('tarifasPlanas:listar', (_evento, estacionamientoId: number) => {
    requerirUsuarioActual()
    return listarTarifasPlanas(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle(
    'boletos:emitir',
    (
      _evento,
      params: {
        estacionamientoId: number
        tipoVehiculoId: number
        placa?: string | null
        tarifaPlanaId?: number | null
      }
    ) => {
      const db = obtenerDb()
      const usuario = requerirUsuarioActual()
      return emitirBoleto(db, {
        estacionamientoId: params.estacionamientoId,
        tipoVehiculoId: params.tipoVehiculoId,
        placa: params.placa,
        tarifaPlanaId: params.tarifaPlanaId,
        usuarioEmisionId: usuario.id
      })
    }
  )

  ipcMain.handle('boletos:listarAbiertos', (_evento, estacionamientoId: number) => {
    return listarBoletosAbiertos(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle('boletos:cerrar', (_evento, params: { estacionamientoId: number; boletoId: number }) => {
    const db = obtenerDb()
    const usuario = requerirUsuarioActual()
    const cierre = cerrarBoleto(db, { boletoId: params.boletoId, usuarioCobroId: usuario.id })
    sincronizarBoletoCerrado(db, params.estacionamientoId, cierre)
    return cierre
  })

  ipcMain.handle(
    'boletos:cobrarPorFolio',
    (_evento, params: { estacionamientoId: number; serie: string; folio: number }) => {
      const db = obtenerDb()
      const usuario = requerirUsuarioActual()
      const cierre = cobrarBoletoPorFolio(db, {
        estacionamientoId: params.estacionamientoId,
        serie: params.serie,
        folio: params.folio,
        usuarioCobroId: usuario.id
      })
      sincronizarBoletoCerrado(db, params.estacionamientoId, cierre)
      return cierre
    }
  )

  ipcMain.handle('boletos:resumen', (_evento, estacionamientoId: number) => {
    requerirUsuarioActual()
    return obtenerResumen(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle('cortes:hacer', (_evento, estacionamientoId: number) => {
    const db = obtenerDb()
    const usuario = requerirUsuarioActual()
    return hacerCorte(db, estacionamientoId, usuario.id)
  })

  ipcMain.handle('cortes:listar', (_evento, estacionamientoId: number) => {
    requerirUsuarioActual()
    return listarCortes(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle('cortes:detalle', (_evento, corteId: number) => {
    requerirUsuarioActual()
    return obtenerDetalleCorte(obtenerDb(), corteId)
  })

  ipcMain.handle('cortes:mensual', (_evento, params: { estacionamientoId: number; anio: number; mes: number }) => {
    requerirUsuarioActual()
    return obtenerCorteMensual(obtenerDb(), params.estacionamientoId, params.anio, params.mes)
  })

  ipcMain.handle('modoSoloSerieA:estado', (_evento, estacionamientoId: number) => {
    requerirUsuarioActual()
    return obtenerModoSoloSerieA(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle('modoSoloSerieA:alternar', (_evento, estacionamientoId: number) => {
    requerirUsuarioActual()
    return alternarModoSoloSerieA(obtenerDb(), estacionamientoId)
  })

  ipcMain.handle('pensionados:listar', (_evento, params: { estacionamientoId: number; incluirBajas?: boolean }) => {
    requerirUsuarioActual()
    return listarPensionados(obtenerDb(), params.estacionamientoId, params.incluirBajas)
  })

  ipcMain.handle(
    'pensionados:crear',
    (
      _evento,
      params: {
        estacionamientoId: number
        nombre: string
        telefono?: string | null
        placa?: string | null
        tipoVehiculoId: number
        cuotaMensual: number
      }
    ) => {
      const usuario = requerirUsuarioActual()
      return crearPensionado(obtenerDb(), { ...params, usuarioAltaId: usuario.id })
    }
  )

  ipcMain.handle('pensionados:darDeBaja', (_evento, id: number) => {
    const usuario = requerirUsuarioActual()
    darDeBajaPensionado(obtenerDb(), { id, usuarioBajaId: usuario.id })
  })

  ipcMain.handle(
    'pensionados:registrarPago',
    (_evento, params: { pensionadoId: number; periodoDesde: string; periodoHasta: string; monto: number }) => {
      const usuario = requerirUsuarioActual()
      return registrarPago(obtenerDb(), { ...params, usuarioId: usuario.id })
    }
  )

  ipcMain.handle('pensionados:sugerirSiguientePeriodo', (_evento, pensionadoId: number) => {
    requerirUsuarioActual()
    return sugerirSiguientePeriodo(obtenerDb(), pensionadoId)
  })

  ipcMain.handle('gastos:listar', (_evento, params: { estacionamientoId: number; desde?: string; hasta?: string }) => {
    requerirUsuarioActual()
    return listarGastos(obtenerDb(), params.estacionamientoId, { desde: params.desde, hasta: params.hasta })
  })

  ipcMain.handle(
    'gastos:registrar',
    (
      _evento,
      params: {
        estacionamientoId: number
        concepto: string
        categoria: CategoriaGasto
        monto: number
        formaPago: FormaPagoGasto
        fecha: string
      }
    ) => {
      const usuario = requerirUsuarioActual()
      return registrarGasto(obtenerDb(), { ...params, usuarioId: usuario.id })
    }
  )

  ipcMain.handle('gastos:eliminar', (_evento, id: number) => {
    requerirUsuarioActual()
    eliminarGasto(obtenerDb(), id)
  })
}

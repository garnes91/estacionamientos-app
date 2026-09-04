import { usb } from 'usb'

// El paquete 'usb' no exporta el tipo UsbDevice directamente (solo el
// objeto `usb` en sí) — se deriva del propio método en vez de importarlo.
type DispositivoUsb = Awaited<ReturnType<typeof usb.getDevices>>[number]
type InterfazUsb = NonNullable<DispositivoUsb['configuration']>['interfaces'][number]
type EndpointUsb = InterfazUsb['alternate']['endpoints'][number]

// Clase de dispositivo USB "Printer" (ver USB spec) — así se filtra la
// lista de dispositivos conectados para mostrar solo impresoras.
const CLASE_IMPRESORA = 7
// Timeout de las transferencias USB, en ms.
const TIMEOUT_MS = 5000

function buscarInterfazDeImpresora(dispositivo: DispositivoUsb): InterfazUsb | undefined {
  return dispositivo.configuration?.interfaces?.find((i: InterfazUsb) => i.alternate.interfaceClass === CLASE_IMPRESORA)
}

function nombreDispositivo(dispositivo: DispositivoUsb): string {
  const nombre = [dispositivo.manufacturerName, dispositivo.productName].filter(Boolean).join(' ')
  if (nombre) return nombre
  const vid = dispositivo.vendorId.toString(16).padStart(4, '0').toUpperCase()
  const pid = dispositivo.productId.toString(16).padStart(4, '0').toUpperCase()
  return `Dispositivo USB ${vid}:${pid}`
}

export interface ImpresoraUsb {
  vendorId: number
  productId: number
  nombre: string
}

/** Lista los dispositivos USB conectados que se anuncian como impresora (clase 7). */
export async function listarImpresorasUsb(): Promise<ImpresoraUsb[]> {
  const dispositivos = await usb.getDevices()
  return dispositivos
    .filter((d) => buscarInterfazDeImpresora(d) !== undefined)
    .map((d) => ({ vendorId: d.vendorId, productId: d.productId, nombre: nombreDispositivo(d) }))
}

/**
 * Manda bytes crudos (ESC/POS, ver src/main/escpos.ts) directo al endpoint
 * de salida de la impresora — sin pasar por el sistema de impresión de
 * Windows ni por ningún driver del fabricante. Requiere que el dispositivo
 * tenga el driver genérico WinUSB asignado (ver plan: se instala una vez
 * con Zadig), no el driver de impresora normal.
 */
export async function enviarCrudo(vendorId: number, productId: number, datos: Buffer): Promise<void> {
  const dispositivo = await usb.findDeviceByIds(vendorId, productId)
  if (!dispositivo) {
    throw new Error(`No se encontró la impresora USB ${vendorId.toString(16)}:${productId.toString(16)} — ¿sigue conectada?`)
  }

  await dispositivo.open()
  try {
    if (!dispositivo.configuration) {
      await dispositivo.selectConfiguration(dispositivo.configurations[0].configurationValue)
    }

    const interfazImpresora = buscarInterfazDeImpresora(dispositivo)
    if (!interfazImpresora) {
      throw new Error('Este dispositivo USB no tiene una interfaz de impresora — ¿es el dispositivo correcto?')
    }

    await dispositivo.claimInterface(interfazImpresora.interfaceNumber)
    try {
      const endpointSalida = interfazImpresora.alternate.endpoints.find((e: EndpointUsb) => e.direction === 'out')
      if (!endpointSalida) {
        throw new Error('La impresora no tiene un endpoint de salida — no se le puede mandar nada.')
      }
      await dispositivo.nativeTransferOut(endpointSalida.endpointNumber, TIMEOUT_MS, datos)
    } finally {
      await dispositivo.releaseInterface(interfazImpresora.interfaceNumber)
    }
  } finally {
    await dispositivo.close()
  }
}

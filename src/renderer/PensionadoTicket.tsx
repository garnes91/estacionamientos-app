import type { ReactElement } from 'react'

export type TipoTicketPensionado = 'alta' | 'baja' | 'pago'

export interface DatosTicketPensionado {
  tipo: TipoTicketPensionado
  folio: number
  estacionamientoNombre: string
  nombre: string
  placa: string | null
  tipoVehiculo: string
  fecha: string
  // Alta/baja: cuotaMensual. Pago: monto + periodo cubierto.
  cuotaMensual?: number
  monto?: number
  periodoDesde?: string
  periodoHasta?: string
}

const TITULOS: Record<TipoTicketPensionado, string> = {
  alta: 'Alta de pensionado',
  baja: 'Baja de pensionado',
  pago: 'Recibo de pago — pensionado'
}

/**
 * Comprobante de una acción sobre un pensionado (alta, baja o pago) — se
 * imprime dos veces (una para el cliente, otra para el estacionamiento, ver
 * Pensionados.tsx) con el mismo mecanismo que ReciboCobro.tsx: se captura el
 * outerHTML de este elemento vía src/main/print.ts. Lleva espacio para
 * firma porque, a diferencia de un boleto de paso, documenta un acuerdo con
 * el cliente (alta/baja de la mensualidad, o el pago de un periodo).
 */
export function PensionadoTicket({ datos }: { datos: DatosTicketPensionado }): ReactElement {
  return (
    <div id="pensionado-ticket" style={{ width: '72mm', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.4 }}>
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14 }}>{datos.estacionamientoNombre}</div>
      <hr />
      <div style={{ textAlign: 'center' }}>{TITULOS[datos.tipo]}</div>
      <div>Folio: P-{datos.folio}</div>
      <div>Fecha: {new Date(datos.fecha).toLocaleString('es-MX')}</div>
      <hr />
      <div>Nombre: {datos.nombre}</div>
      <div>Vehículo: {datos.tipoVehiculo}</div>
      <div>Placa: {datos.placa ?? '—'}</div>
      {(datos.tipo === 'alta' || datos.tipo === 'baja') && datos.cuotaMensual != null && (
        <div>Cuota mensual: ${datos.cuotaMensual.toFixed(2)}</div>
      )}
      {datos.tipo === 'pago' && (
        <>
          <div>
            Periodo: {new Date(datos.periodoDesde!).toLocaleDateString('es-MX')} —{' '}
            {new Date(datos.periodoHasta!).toLocaleDateString('es-MX')}
          </div>
          <div style={{ fontWeight: 'bold' }}>Monto pagado: ${datos.monto!.toFixed(2)}</div>
        </>
      )}
      <hr />
      <div style={{ marginTop: '1.5rem' }}>Firma: ________________________</div>
    </div>
  )
}

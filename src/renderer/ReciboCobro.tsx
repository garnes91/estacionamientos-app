import type { ReactElement } from 'react'
import { urlFacturacion } from '../logic/urlFacturacion'
import { CodigoQR } from './CodigoQR'

export interface DatosReciboCobro {
  estacionamientoNombre: string
  textoBoleto: string | null
  tipoCobro: 'regular' | 'plana'
  minutosTotales: number
  monto: number
  excedenteMinutos?: number
  excedenteMonto?: number
  recargoBoletoPerdido?: number
}

/**
 * Recibo de pago — desglosa cómo se llegó al monto cobrado (tiempo total o,
 * en tarifa plana, el fijo más el excedente) para que quede claro ante un
 * reclamo. Se imprime igual que el boleto de entrada (outerHTML de este
 * elemento vía src/main/print.ts).
 *
 * A propósito NO lleva el folio ni el texto legal del boleto — a pedido
 * del usuario, esa información solo va en el boleto de entrada
 * (BoletoImprimible.tsx); este recibo solo identifica el pago por su
 * código de facturación, si aplica.
 */
export function ReciboCobro({
  datos,
  codigoFactura,
  slugFacturacion
}: {
  datos: DatosReciboCobro
  // Código de facturación propio del boleto (ver formatearCodigoFacturacionBoleto
  // en src/logic/folioBarcode.ts) — null si facturación no está habilitada o no
  // hay proyecto Firebase configurado.
  codigoFactura: string | null
  slugFacturacion: string | null
}): ReactElement {
  const recargoBoletoPerdido = datos.recargoBoletoPerdido ?? 0
  // El desglose por tiempo/tarifa plana es siempre sobre el cálculo normal —
  // el recargo por boleto perdido se muestra aparte, no mezclado ahí.
  const montoSinRecargo = datos.monto - recargoBoletoPerdido
  const montoFijo = datos.tipoCobro === 'plana' ? montoSinRecargo - (datos.excedenteMonto ?? 0) : null

  return (
    <div id="recibo-cobro" style={{ width: '72mm', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.4 }}>
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14 }}>{datos.estacionamientoNombre}</div>
      {datos.textoBoleto && (
        <div style={{ textAlign: 'center', whiteSpace: 'pre-line', margin: '0.25rem 0' }}>{datos.textoBoleto}</div>
      )}
      <hr />
      <div style={{ textAlign: 'center' }}>Recibo de pago</div>
      {datos.tipoCobro === 'regular' ? (
        <div>
          Tiempo: {datos.minutosTotales} min — ${montoSinRecargo.toFixed(2)}
        </div>
      ) : (
        <>
          <div>Tarifa plana: ${montoFijo!.toFixed(2)}</div>
          {datos.excedenteMinutos ? (
            <div>
              Excedente: {datos.excedenteMinutos} min — ${(datos.excedenteMonto ?? 0).toFixed(2)}
            </div>
          ) : null}
        </>
      )}
      {recargoBoletoPerdido ? <div>Recargo boleto perdido: ${recargoBoletoPerdido.toFixed(2)}</div> : null}
      <hr />
      <div style={{ fontWeight: 'bold', textAlign: 'right' }}>Total: ${datos.monto.toFixed(2)}</div>
      {codigoFactura && (
        <div style={{ marginTop: '0.5rem' }}>
          <div>Código de factura: {codigoFactura}</div>
          {slugFacturacion && (
            <>
              <CodigoQR texto={urlFacturacion(slugFacturacion, codigoFactura)} />
              <div style={{ textAlign: 'center', fontSize: 10 }}>Escanea para facturar</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

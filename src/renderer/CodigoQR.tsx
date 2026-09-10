import qrcode from 'qrcode-generator'
import type { ReactElement } from 'react'

/**
 * QR dibujado a mano con <rect> (a partir de la matriz que da
 * qrcode-generator) en vez de inyectar el <svg> que la librería puede
 * generar como string — evita meter HTML no controlado al ticket (mismo
 * criterio que JsBarcode en BoletoImprimible.tsx, pero ahí la librería sí
 * escribe directo a un <svg> por ref).
 */
export function CodigoQR({ texto, tamanoModulo = 3 }: { texto: string; tamanoModulo?: number }): ReactElement {
  const qr = qrcode(0, 'M')
  qr.addData(texto)
  qr.make()

  const modulos = qr.getModuleCount()
  const tamano = modulos * tamanoModulo

  const celdas: ReactElement[] = []
  for (let fila = 0; fila < modulos; fila++) {
    for (let columna = 0; columna < modulos; columna++) {
      if (qr.isDark(fila, columna)) {
        celdas.push(
          <rect
            key={`${fila}-${columna}`}
            x={columna * tamanoModulo}
            y={fila * tamanoModulo}
            width={tamanoModulo}
            height={tamanoModulo}
          />
        )
      }
    }
  }

  return (
    <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} style={{ display: 'block', margin: '0 auto' }}>
      <rect width={tamano} height={tamano} fill="#fff" />
      <g fill="#000">{celdas}</g>
    </svg>
  )
}

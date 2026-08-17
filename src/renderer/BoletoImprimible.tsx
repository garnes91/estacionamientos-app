import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import JsBarcode from 'jsbarcode'
import { formatearFolio } from '../logic/folioBarcode'
import { binarizarImagen } from './binarizarImagen'
import esquemaCoche from './assets/esquema-coche.jpg?inline'

export interface DatosBoletoImprimible {
  estacionamientoNombre: string
  textoBoleto: string | null
  serie: string
  folio: number
  tipoVehiculo: string
  placa: string | null
  horaEntrada: string
  tarifaPlana?: { nombre: string; precioFijo: number; horasIncluidas: number } | null
}

/**
 * Vista angosta (ancho típico de rollo térmico) con el código de barras
 * Code128 del folio. Se imprime aparte, en una ventana dedicada (ver
 * src/main/print.ts), tomando el outerHTML de este elemento (id
 * "boleto-imprimible") ya renderizado.
 */
export function BoletoImprimible({ datos }: { datos: DatosBoletoImprimible }): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null)
  const textoFolio = formatearFolio(datos.serie, datos.folio)
  const [errorBarcode, setErrorBarcode] = useState<string | null>(null)
  const [esquemaBN, setEsquemaBN] = useState<string | null>(null)

  useEffect(() => {
    binarizarImagen(esquemaCoche)
      .then(setEsquemaBN)
      .catch(() => setEsquemaBN(esquemaCoche))
  }, [])

  useEffect(() => {
    if (!svgRef.current) return
    try {
      JsBarcode(svgRef.current, textoFolio, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 14,
        height: 50,
        width: 2,
        margin: 4
      })
      setErrorBarcode(null)
    } catch {
      // La serie de este folio tiene un carácter que Code128 no puede
      // codificar (no debería pasar: crearSerie ya lo valida al crear la
      // serie, esto es solo para no tumbar la app si algo viejo se coló).
      setErrorBarcode(`No se pudo generar el código de barras para "${textoFolio}"`)
    }
  }, [textoFolio])

  return (
    <div id="boleto-imprimible" style={{ width: '76mm', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.4 }}>
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14 }}>{datos.estacionamientoNombre}</div>
      {datos.textoBoleto && (
        <div style={{ textAlign: 'center', whiteSpace: 'pre-line', margin: '0.25rem 0' }}>{datos.textoBoleto}</div>
      )}
      <hr />
      <div>Folio: {textoFolio}</div>
      <div>Vehículo: {datos.tipoVehiculo}</div>
      {datos.placa && <div>Placa: {datos.placa}</div>}
      <div>Entrada: {new Date(datos.horaEntrada).toLocaleString()}</div>
      {datos.tarifaPlana && (
        <div>
          Tarifa plana: {datos.tarifaPlana.nombre} (${datos.tarifaPlana.precioFijo}/{datos.tarifaPlana.horasIncluidas}h)
        </div>
      )}
      <hr />
      {errorBarcode ? (
        <div style={{ color: 'crimson', fontSize: 11 }}>{errorBarcode}</div>
      ) : (
        <svg ref={svgRef} style={{ width: '100%' }} />
      )}
      <hr />
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: '0.25rem' }}>Marcar daños visibles al ingresar:</div>
        {esquemaBN && (
          <img
            src={esquemaBN}
            alt="Esquema del vehículo"
            style={{ width: '100%', aspectRatio: '800 / 523' }}
          />
        )}
      </div>
    </div>
  )
}

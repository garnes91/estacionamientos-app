import ExcelJS from 'exceljs'
import type { DetalleCorte } from '../db/cortes'

/** Arma el corte como libro de Excel: un resumen y el detalle de cada boleto, para el correo. */
export async function generarExcelCorte(detalle: DetalleCorte, nombreEstacionamiento: string): Promise<Buffer> {
  const libro = new ExcelJS.Workbook()
  libro.creator = nombreEstacionamiento

  const resumen = libro.addWorksheet('Resumen')
  resumen.columns = [
    { header: 'Campo', key: 'campo', width: 24 },
    { header: 'Valor', key: 'valor', width: 40 }
  ]
  resumen.addRows([
    { campo: 'Estacionamiento', valor: nombreEstacionamiento },
    { campo: 'Desde', valor: new Date(detalle.desde).toLocaleString() },
    { campo: 'Hasta', valor: new Date(detalle.hasta).toLocaleString() },
    { campo: 'Total de boletos', valor: detalle.totalBoletos },
    { campo: 'Total cobrado', valor: detalle.totalMonto }
  ])
  resumen.addRow({})
  resumen.addRow({ campo: 'Tipo de vehículo', valor: 'Boletos / Monto' })
  detalle.porTipoVehiculo.forEach((fila) => {
    resumen.addRow({ campo: fila.tipoVehiculo, valor: `${fila.boletos} / $${fila.monto.toFixed(2)}` })
  })
  resumen.getRow(1).font = { bold: true }

  const hojaDetalle = libro.addWorksheet('Detalle')
  hojaDetalle.columns = [
    { header: 'Serie', key: 'serie', width: 8 },
    { header: 'Folio', key: 'folio', width: 10 },
    { header: 'Tipo de vehículo', key: 'tipoVehiculo', width: 18 },
    { header: 'Entrada', key: 'horaEntrada', width: 20 },
    { header: 'Salida', key: 'horaSalida', width: 20 },
    { header: 'Monto', key: 'monto', width: 12 }
  ]
  hojaDetalle.getRow(1).font = { bold: true }

  for (const porSerie of detalle.porSerie) {
    for (const boleto of porSerie.boletos) {
      hojaDetalle.addRow({
        serie: boleto.serie,
        folio: boleto.folio,
        tipoVehiculo: boleto.tipoVehiculo,
        horaEntrada: new Date(boleto.horaEntrada).toLocaleString(),
        horaSalida: new Date(boleto.horaSalida).toLocaleString(),
        monto: boleto.monto
      })
    }
  }

  const buffer = await libro.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

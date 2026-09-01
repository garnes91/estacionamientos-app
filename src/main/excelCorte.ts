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
    { campo: 'Total cobrado (boletos)', valor: detalle.totalMonto },
    { campo: 'Pagos de pensionados', valor: detalle.pensionadosPagosCantidad },
    { campo: 'Total cobrado (pensionados)', valor: detalle.pensionadosPagosMonto },
    { campo: 'Gastos en efectivo', valor: detalle.gastosEfectivoCantidad },
    { campo: 'Total gastos en efectivo', valor: detalle.gastosEfectivoMonto },
    { campo: 'Total en caja', valor: detalle.totalMonto + detalle.pensionadosPagosMonto - detalle.gastosEfectivoMonto }
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

  if (detalle.pagosPensionados.length > 0 || detalle.altasPensionados.length > 0 || detalle.bajasPensionados.length > 0) {
    const hojaPensionados = libro.addWorksheet('Pensionados')
    hojaPensionados.columns = [
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Pensionado', key: 'nombre', width: 24 },
      { header: 'Detalle', key: 'detalle', width: 30 },
      { header: 'Monto', key: 'monto', width: 12 }
    ]
    hojaPensionados.getRow(1).font = { bold: true }

    for (const alta of detalle.altasPensionados) {
      hojaPensionados.addRow({ tipo: 'Alta', nombre: alta.nombre, detalle: new Date(alta.fecha).toLocaleString(), monto: '' })
    }
    for (const baja of detalle.bajasPensionados) {
      hojaPensionados.addRow({ tipo: 'Baja', nombre: baja.nombre, detalle: new Date(baja.fecha).toLocaleString(), monto: '' })
    }
    for (const pago of detalle.pagosPensionados) {
      hojaPensionados.addRow({
        tipo: 'Pago',
        nombre: pago.pensionadoNombre,
        detalle: `${new Date(pago.periodoDesde).toLocaleDateString()} — ${new Date(pago.periodoHasta).toLocaleDateString()}`,
        monto: pago.monto
      })
    }
  }

  if (detalle.gastosDelPeriodo.length > 0) {
    const hojaGastos = libro.addWorksheet('Gastos')
    hojaGastos.columns = [
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'Concepto', key: 'concepto', width: 24 },
      { header: 'Categoría', key: 'categoria', width: 14 },
      { header: 'Forma de pago', key: 'formaPago', width: 14 },
      { header: 'Monto', key: 'monto', width: 12 }
    ]
    hojaGastos.getRow(1).font = { bold: true }

    for (const gasto of detalle.gastosDelPeriodo) {
      hojaGastos.addRow({
        fecha: new Date(gasto.fecha).toLocaleString(),
        concepto: gasto.concepto,
        categoria: gasto.categoria,
        formaPago: gasto.formaPago,
        monto: gasto.monto
      })
    }
  }

  const buffer = await libro.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

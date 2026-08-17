/**
 * Formato del texto que se codifica en el código de barras (Code128) del
 * boleto y que el escáner (funciona como teclado/wedge) devuelve tal cual
 * al leerlo. Se usa tanto al imprimir (formatearFolio) como al escanear en
 * la salida (parsearFolio) — mantenerlos aquí evita que se desincronicen.
 */

const DIGITOS_FOLIO = 6

export function formatearFolio(serie: string, folio: number): string {
  return `${serie}-${String(folio).padStart(DIGITOS_FOLIO, '0')}`
}

export interface FolioParseado {
  serie: string
  folio: number
}

export function parsearFolio(texto: string): FolioParseado | null {
  const coincidencia = texto.trim().toUpperCase().match(/^([A-Z]+)-(\d+)$/)
  if (!coincidencia) return null
  return { serie: coincidencia[1], folio: Number(coincidencia[2]) }
}

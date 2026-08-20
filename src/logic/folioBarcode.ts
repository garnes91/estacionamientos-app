/**
 * Formato del texto que se codifica en el código de barras (Code128) del
 * boleto y que el escáner (funciona como teclado/wedge) devuelve tal cual
 * al leerlo. Se usa tanto al imprimir (formatearFolio) como al escanear en
 * la salida (parsearFolio) — mantenerlos aquí evita que se desincronicen.
 *
 * El código que se muestra/imprime NO es el folio secuencial real ni deja
 * ver la letra de la serie: ambos se integran en un solo número (vía
 * folioCifrado, Feistel) con la clave del estacionamiento, para que un
 * cliente no pueda inferir el volumen de boletos ni de qué serie es
 * comparando el suyo con el de otro. El folio real y la serie (los que usa
 * la base de datos internamente) nunca cambian — claveFolio solo afecta
 * esta capa de presentación/escaneo.
 *
 * Solo series de 1 letra (A-Z) se integran en el código puramente
 * numérico — es lo único que se usa en la práctica. Si alguna vez existe
 * una serie de más de 1 letra, se usa un formato de respaldo con la letra
 * visible (ver el "else" de cada función) para no perder la capacidad de
 * operar esa serie.
 */

import {
  cifrarFolio,
  cifrarFolioConSerie,
  descifrarFolio,
  descifrarFolioConSerie,
  DIGITOS_CODIGO
} from './folioCifrado'

const DIGITOS_FOLIO = 6

export function formatearFolio(serie: string, folio: number, claveFolio: string): string {
  const codigo = cifrarFolioConSerie(serie, folio, claveFolio)
  if (codigo !== null) {
    return String(codigo).padStart(DIGITOS_CODIGO, '0')
  }
  const folioMostrado = cifrarFolio(folio, claveFolio)
  return `${serie}-${String(folioMostrado).padStart(DIGITOS_FOLIO, '0')}`
}

export interface FolioParseado {
  serie: string
  folio: number
}

export function parsearFolio(texto: string, claveFolio: string): FolioParseado | null {
  const limpio = texto.trim().toUpperCase()

  if (/^\d+$/.test(limpio)) {
    return descifrarFolioConSerie(Number(limpio), claveFolio)
  }

  const coincidencia = limpio.match(/^([A-Z]+)-(\d+)$/)
  if (!coincidencia) return null
  return { serie: coincidencia[1], folio: descifrarFolio(Number(coincidencia[2]), claveFolio) }
}

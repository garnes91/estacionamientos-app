/**
 * Formato del texto que se codifica en el código de barras (Code128) del
 * boleto y que el escáner (funciona como teclado/wedge) devuelve tal cual
 * al leerlo. Se usa tanto al imprimir (formatearFolioImpreso) como al
 * escanear en la salida (parsearFolioImpreso) — mantenerlos aquí evita que
 * se desincronicen.
 *
 * El folio impreso/escaneado es el folio SECUENCIAL REAL, sin cifrar — el
 * SAT exige que el folio de un comprobante sea consecutivo. La letra de la
 * serie tampoco se muestra directo: cada serie tiene un "marcador" (un
 * símbolo corto, ver MARCADORES_DISPONIBLES) que la sustituye en lo que ve
 * el cliente, tanto en el texto como en lo que codifica el código de
 * barras — así dos series nunca imprimen algo ambiguo (ej. ambas
 * "000020") sin necesidad de mostrar la letra real. La letra/folio reales
 * siguen siendo la fuente de verdad en toda la base de datos; el marcador
 * es solo una capa de presentación (ver src/db/series.ts).
 *
 * El cifrado Feistel (folioCifrado.ts) ya NO se usa para este folio — se
 * quedó exclusivamente para generar códigos de facturación opacos
 * (formatearCodigoPago, formatearCodigoFacturacionBoleto más abajo).
 */

import { cifrarFolio } from './folioCifrado'

const DIGITOS_FOLIO = 6

// Pool curado: símbolos ASCII fuera de A-Z/0-9 (no colisiona con el
// parseo de folio, que asume "1er carácter = marcador, resto = dígitos"),
// seguros para CODE128 (todo el Set B es 0x20-0x7E) y para CP850 (coincide
// con ASCII en ese rango, ver src/main/escpos.ts). Sin "-" a propósito: se
// usa como separador en el formato plano de pantallas internas
// (formatearFolioPlano) y no debe confundirse con un marcador.
export const MARCADORES_DISPONIBLES = ['*', '#', '+', '=', '@', '%', '&', '!', '^', '~']
export const MARCADOR_VALIDO = /^[*#+=@%&!^~]$/

/**
 * Folio REAL, sin cifrar (requisito SAT) — el marcador sustituye a la
 * letra de serie. Si la serie ya no tiene marcador asignado (caso raro:
 * se borró la serie con un boleto todavía abierto, ver eliminarSerie en
 * src/db/series.ts), se cae de vuelta al formato con la letra visible —
 * mejor eso que no poder imprimir el folio.
 */
export function formatearFolioImpreso(marcador: string | null, serie: string, folio: number): string {
  const prefijo = marcador ?? `${serie}-`
  return `${prefijo}${String(folio).padStart(DIGITOS_FOLIO, '0')}`
}

export interface FolioImpresoParseado {
  marcador: string
  folio: number
}

/**
 * Solo separa "primer carácter = marcador" de "resto = dígitos" — no sabe
 * a qué serie corresponde el marcador (eso exige consultar series_folio,
 * ver buscarSeriePorMarcador en src/db/series.ts), así que esta función se
 * puede seguir usando en el renderer sin acceso a la base de datos, solo
 * como filtro de forma antes de mandar el texto al proceso principal. El
 * marcador NUNCA es un dígito (a propósito, ver MARCADOR_VALIDO), para que
 * un folio puro nunca se confunda con "marcador 0 + folio corto".
 */
export function parsearFolioImpreso(texto: string): FolioImpresoParseado | null {
  const coincidencia = texto.trim().match(/^(\D)(\d+)$/)
  if (!coincidencia) return null
  return { marcador: coincidencia[1], folio: Number(coincidencia[2]) }
}

/** Para pantallas internas/admin (Corte de caja, Boletos abiertos) — nunca para el ticket del cliente. */
export function formatearFolioPlano(serie: string, folio: number): string {
  return `${serie}-${String(folio).padStart(DIGITOS_FOLIO, '0')}`
}

/**
 * Código de un PAGO de pensionado, para autofacturación — no es un folio
 * de boleto (no hay serie ni escaneo de por medio), así que usa el cifrado
 * simple sobre el id del pago, con la MISMA llave del estacionamiento. El
 * prefijo "MEN-" es solo para que a simple vista nunca se confunda con un
 * código de boleto ("BOL-...") — este código nunca se vuelve a descifrar:
 * el cliente lo pega tal cual en el portal y el servidor lo busca por
 * igualdad exacta en Firestore.
 */
export function formatearCodigoPago(pagoId: number, claveFolio: string): string {
  const cifrado = cifrarFolio(pagoId, claveFolio)
  return `MEN-${String(cifrado).padStart(DIGITOS_FOLIO, '0')}`
}

/**
 * Código de facturación de UN boleto cerrado — mismo mecanismo que
 * formatearCodigoPago (cifra un id local, nunca se vuelve a descifrar),
 * pero cifra el id del BOLETO, no de un pago. Prefijo "BOL-" para
 * distinguirlo a simple vista de un código de pensionado. Queda
 * totalmente desacoplado del folio impreso/escaneado (que ahora es
 * plano) — así el folio puede ser público/secuencial sin que eso abra la
 * puerta a adivinar códigos de facturación ajenos.
 */
export function formatearCodigoFacturacionBoleto(boletoId: number, claveFolio: string): string {
  const cifrado = cifrarFolio(boletoId, claveFolio)
  return `BOL-${String(cifrado).padStart(DIGITOS_FOLIO, '0')}`
}

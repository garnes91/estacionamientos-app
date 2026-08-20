/**
 * Cifrado tipo Feistel (con "cycle-walking") para que el folio que se
 * imprime y se escanea no delate cuántos boletos van ni de qué serie son —
 * un cliente viendo su ticket y el de otro no puede inferir el volumen de
 * ventas. No es criptografía fuerte ni hace falta que lo sea: el objetivo
 * es ofuscación, no resistir un ataque dirigido. El folio real
 * (secuencial) y la serie siguen siendo la fuente de verdad en toda la
 * base de datos — esto solo transforma cómo se ve/lee en el ticket (ver
 * src/logic/folioBarcode.ts).
 *
 * Cycle-walking: la red Feistel es una permutación completa de un dominio
 * potencia de 2. Como el rango que se quiere permutar no es potencia de 2,
 * se re-cifra cualquier resultado que caiga fuera de rango hasta que caiga
 * dentro — técnica estándar para cifrado que preserva formato.
 */

const RONDAS = 4

/** Hash de la clave de texto a un entero de 32 bits — se calcula una sola vez por llamada, no por ronda. */
function hashClave(clave: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < clave.length; i++) {
    h = Math.imul(h ^ clave.charCodeAt(i), 0x01000193)
  }
  return h >>> 0
}

/** Mezcla rápida tipo murmur — solo aritmética entera, sin construir strings por ronda. */
function funcionRonda(mitad: number, ronda: number, claveHash: number, mascaraMitad: number): number {
  let h = Math.imul(claveHash ^ Math.imul(mitad + 1, 0x27d4eb2f), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h ^ (ronda + 1), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) & mascaraMitad
}

function aplicarFeistel(valor: number, claveHash: number, bitsMitad: number, descifrando: boolean): number {
  const mascaraMitad = (1 << bitsMitad) - 1
  let l = (valor >>> bitsMitad) & mascaraMitad
  let r = valor & mascaraMitad

  for (let paso = 0; paso < RONDAS; paso++) {
    const ronda = descifrando ? RONDAS - 1 - paso : paso
    if (descifrando) {
      const nuevoR = l
      const nuevoL = r ^ funcionRonda(l, ronda, claveHash, mascaraMitad)
      l = nuevoL
      r = nuevoR
    } else {
      const nuevoL = r
      const nuevoR = l ^ funcionRonda(r, ronda, claveHash, mascaraMitad)
      l = nuevoL
      r = nuevoR
    }
  }

  return ((l << bitsMitad) | r) >>> 0
}

function cifrarEnRango(valor: number, claveFolio: string, rango: number, bitsMitad: number): number {
  if (valor < 0 || valor >= rango) return valor
  const claveHash = hashClave(claveFolio)
  let v = valor
  do {
    v = aplicarFeistel(v, claveHash, bitsMitad, false)
  } while (v >= rango)
  return v
}

function descifrarEnRango(valor: number, claveFolio: string, rango: number, bitsMitad: number): number {
  if (valor < 0 || valor >= rango) return valor
  const claveHash = hashClave(claveFolio)
  let v = valor
  do {
    v = aplicarFeistel(v, claveHash, bitsMitad, true)
  } while (v >= rango)
  return v
}

// ---- Cifrado de solo el folio (sin la serie) ----
export const RANGO_MAXIMO = 1_000_000 // folios 0..999,999 se cifran; folios mayores (nunca en la práctica) pasan igual
const BITS_MITAD_FOLIO = 10 // 2^20 = 1,048,576 > RANGO_MAXIMO

export function cifrarFolio(folio: number, claveFolio: string): number {
  return cifrarEnRango(folio, claveFolio, RANGO_MAXIMO, BITS_MITAD_FOLIO)
}

export function descifrarFolio(folioMostrado: number, claveFolio: string): number {
  return descifrarEnRango(folioMostrado, claveFolio, RANGO_MAXIMO, BITS_MITAD_FOLIO)
}

// ---- Cifrado de folio + serie integrados en un solo código numérico ----
// Solo soporta series de 1 letra (A-Z) — que es lo único que se usa en la
// práctica. Una serie de más de 1 letra no se puede integrar en el código
// (formatearFolio hace un respaldo mostrando la letra aparte en ese caso).
export const MAX_LETRAS = 26
export const RANGO_COMBINADO = RANGO_MAXIMO * MAX_LETRAS // 26,000,000 — combinaciones reales posibles

// El cycle-walking se hace sobre RANGO_CIFRADO (100,000,000, el rango
// completo de 8 dígitos), no sobre RANGO_COMBINADO — si se caminara sobre
// el rango real (26,000,000), el resultado SIEMPRE quedaría en el 26% más
// bajo del espacio de 8 dígitos, o sea que el primer dígito solo podría
// ser 0, 1 o 2 (un patrón detectable a simple vista, aunque no delate la
// serie ni el volumen). Caminando sobre el rango de 8 dígitos completo, el
// primer dígito sale uniforme 0-9. Un código que descifra a un valor fuera
// de RANGO_COMBINADO simplemente no es un folio válido (se rechaza).
export const RANGO_CIFRADO = 10 ** 8 // 100,000,000
const BITS_MITAD_COMBINADO = 14 // 2^28 = 268,435,456 > RANGO_CIFRADO
export const DIGITOS_CODIGO = String(RANGO_CIFRADO - 1).length // 8

export function indiceDeLetra(letra: string): number | null {
  if (!/^[A-Z]$/.test(letra)) return null
  return letra.charCodeAt(0) - 65
}

export function letraDeIndice(indice: number): string {
  return String.fromCharCode(65 + indice)
}

export function cifrarFolioConSerie(serie: string, folio: number, claveFolio: string): number | null {
  const indice = indiceDeLetra(serie)
  if (indice === null || folio < 0 || folio >= RANGO_MAXIMO) return null
  const combinado = indice * RANGO_MAXIMO + folio
  return cifrarEnRango(combinado, claveFolio, RANGO_CIFRADO, BITS_MITAD_COMBINADO)
}

export interface FolioConSerie {
  serie: string
  folio: number
}

export function descifrarFolioConSerie(codigo: number, claveFolio: string): FolioConSerie | null {
  if (codigo < 0 || codigo >= RANGO_CIFRADO) return null
  const combinado = descifrarEnRango(codigo, claveFolio, RANGO_CIFRADO, BITS_MITAD_COMBINADO)
  if (combinado >= RANGO_COMBINADO) return null // descifra a un hueco sin usar: código inválido/inventado
  return { serie: letraDeIndice(Math.floor(combinado / RANGO_MAXIMO)), folio: combinado % RANGO_MAXIMO }
}

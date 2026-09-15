/**
 * Cifrado tipo Feistel (con "cycle-walking"), usado EXCLUSIVAMENTE para
 * generar códigos de facturación opacos (ver formatearCodigoPago y
 * formatearCodigoFacturacionBoleto en src/logic/folioBarcode.ts) — el
 * folio impreso/escaneado del boleto ya NO pasa por aquí: el SAT exige
 * que sea el número secuencial real, sin cifrar. No es criptografía
 * fuerte ni hace falta que lo sea: el objetivo es que un código de
 * facturación no sea adivinable a partir de otro, no resistir un ataque
 * dirigido.
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

// Cifra el folio/id local para un código de facturación opaco
// (formatearCodigoPago, formatearCodigoFacturacionBoleto). Estos códigos
// nunca se vuelven a descifrar — el servidor los busca por igualdad
// exacta en Firestore — así que no hace falta una función de descifrado.
export const RANGO_MAXIMO = 1_000_000 // valores 0..999,999 se cifran; mayores (nunca en la práctica) pasan igual
const BITS_MITAD_FOLIO = 10 // 2^20 = 1,048,576 > RANGO_MAXIMO

export function cifrarFolio(folio: number, claveFolio: string): number {
  return cifrarEnRango(folio, claveFolio, RANGO_MAXIMO, BITS_MITAD_FOLIO)
}

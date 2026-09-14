/** Da formato es-MX a una fecha que puede venir como Timestamp de Firestore o como string/ISO. */
export function formatearFecha(valor: unknown): string {
  const fecha = typeof (valor as { toDate?: () => Date })?.toDate === 'function' ? (valor as { toDate: () => Date }).toDate() : new Date(valor as string)
  return fecha.toLocaleDateString('es-MX')
}

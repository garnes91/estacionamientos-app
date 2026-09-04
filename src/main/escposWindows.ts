import { writeFile } from 'fs/promises'

/**
 * Manda bytes crudos (ESC/POS, ver src/main/escpos.ts) a una impresora
 * compartida localmente en Windows — alternativa a escposUsb.ts para esta
 * plataforma, donde Zadig/WinUSB no logra reemplazar el driver en
 * impresoras clase USB "Printer" (Windows protege esa clase incluso
 * después de liberar el dispositivo en Administrador de dispositivos).
 *
 * En vez de hablarle al dispositivo USB directo, se aprovecha que Windows
 * ya sabe imprimir en la impresora vía el driver genérico incluido
 * "Generic / Text Only" (sin problema de firma, viene con Windows) y se
 * escribe el buffer tal cual a la ruta UNC del recurso compartido — el
 * redirector SMB/spooler de Windows lo manda como trabajo de impresión
 * RAW (sin reinterpretar los bytes), igual que hace `copy /b archivo
 * \\localhost\recurso` desde la terminal. Requiere que el usuario:
 *   1. Instale la impresora en Windows con el driver "Generic / Text Only".
 *   2. La comparta (Propiedades > Compartir) con un nombre de recurso
 *      simple (sin espacios), ese mismo nombre se configura en
 *      Admin > Impresión.
 */
export async function enviarCrudoWindows(nombreRecurso: string, datos: Buffer): Promise<void> {
  const ruta = `\\\\localhost\\${nombreRecurso}`
  try {
    await writeFile(ruta, datos)
  } catch (error) {
    throw new Error(
      `No se pudo escribir en la impresora compartida "${nombreRecurso}" (${ruta}). Verifica que esté ` +
        `instalada con el driver "Generic / Text Only", compartida con ese nombre exacto, y conectada. Error: ${error}`
    )
  }
}

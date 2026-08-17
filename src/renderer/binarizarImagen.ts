const UMBRAL_LUMINANCIA = 200

let promesaCache: Promise<string> | null = null

/**
 * Convierte una imagen a blanco y negro puro (sin tonos de gris) dibujándola
 * en un canvas y aplicando un umbral de luminancia. Sin esto, un esquema con
 * líneas de color (ej. verde olivo) corre el riesgo de salir muy tenue o
 * directamente no imprimirse en una impresora térmica: la mayoría no
 * reproduce color y muchas tampoco hacen bien la escala de grises, solo
 * blanco/negro por punto. Se calcula una sola vez y se cachea (la imagen es
 * un asset fijo que no cambia entre boletos).
 */
export function binarizarImagen(src: string): Promise<string> {
  if (!promesaCache) {
    promesaCache = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('No se pudo obtener contexto 2D de canvas'))
          return
        }
        ctx.drawImage(img, 0, 0)
        const datos = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const px = datos.data
        for (let i = 0; i < px.length; i += 4) {
          const luminancia = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
          const valor = luminancia < UMBRAL_LUMINANCIA ? 0 : 255
          px[i] = valor
          px[i + 1] = valor
          px[i + 2] = valor
          px[i + 3] = 255
        }
        ctx.putImageData(datos, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('No se pudo cargar la imagen del esquema del vehículo'))
      img.src = src
    })
  }
  return promesaCache
}

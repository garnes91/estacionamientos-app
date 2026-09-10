/**
 * URL del portal público de autofacturación (ver public/portal-facturacion)
 * — se despliega junto con panel-operador al mismo sitio de Hosting.
 * Igual que SUPER_ADMIN_UID (ver panel-operador/index.html), este dominio
 * está hardcodeado a propósito: esta app sirve un solo negocio (con sus
 * propias sucursales/"socios"), no es una plantilla que cada cliente
 * despliega con su propio dominio.
 */
const URL_BASE_PORTAL_FACTURACION = 'https://parkflowmx.web.app/portal-facturacion/'

/**
 * URL que, al escanearla (QR en el recibo de cobro o de pago de
 * pensionado), abre el portal con el código de autofacturación ya
 * prellenado — ver el parámetro `codigo` en portal-facturacion/index.html.
 */
export function urlFacturacion(slug: string, codigo: string): string {
  const parametros = new URLSearchParams({ estacionamiento: slug, codigo })
  return `${URL_BASE_PORTAL_FACTURACION}?${parametros.toString()}`
}

import { describe, expect, it } from 'vitest'
import { urlFacturacion } from './urlFacturacion'

describe('urlFacturacion', () => {
  it('arma la URL del portal con el slug y el código como parámetros', () => {
    const url = urlFacturacion('centro', 'MEN-042817')
    expect(url).toBe('https://parkflowmx.web.app/portal-facturacion/?estacionamiento=centro&codigo=MEN-042817')
  })

  it('codifica caracteres especiales del código', () => {
    const url = urlFacturacion('centro', 'A B&C')
    const params = new URL(url).searchParams
    expect(params.get('codigo')).toBe('A B&C')
  })
})

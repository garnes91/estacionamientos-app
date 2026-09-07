import { useEffect } from 'react'
import type { ReactElement } from 'react'

/**
 * Confirmación con botones "Sí"/"No" — window.confirm() no permite
 * personalizar los botones. También responde a las teclas S/N (para
 * confirmar sin soltar el teclado, ej. al preguntar "¿Imprimir recibo?"
 * justo después de cobrar un boleto).
 */
export function ConfirmModal({
  mensaje,
  onSi,
  onNo
}: {
  mensaje: string
  onSi: () => void
  onNo: () => void
}): ReactElement {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const tecla = e.key.toLowerCase()
      if (tecla === 's') {
        e.preventDefault()
        onSi()
      } else if (tecla === 'n') {
        e.preventDefault()
        onNo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onSi, onNo])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div style={{ background: 'white', borderRadius: 8, padding: '1.5rem', minWidth: 280, textAlign: 'center' }}>
        <p style={{ marginTop: 0 }}>{mensaje}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={onSi} style={{ padding: '0.4rem 1.5rem' }}>
            Sí (S)
          </button>
          <button onClick={onNo} style={{ padding: '0.4rem 1.5rem' }}>
            No (N)
          </button>
        </div>
      </div>
    </div>
  )
}

import type { ReactElement } from 'react'

/** Confirmación con botones "Sí"/"No" — window.confirm() no permite personalizar los botones. */
export function ConfirmModal({
  mensaje,
  onSi,
  onNo
}: {
  mensaje: string
  onSi: () => void
  onNo: () => void
}): ReactElement {
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
            Sí
          </button>
          <button onClick={onNo} style={{ padding: '0.4rem 1.5rem' }}>
            No
          </button>
        </div>
      </div>
    </div>
  )
}

import { useRef, type ReactNode } from 'react'
import { XIcon } from './common'

/** Scrim + dialog. Closes on a click that both starts and ends on the scrim. */
export function ModalShell({ wide, onClose, label, children }: { wide?: boolean; onClose: () => void; label?: string; children: ReactNode }) {
  const down = useRef<EventTarget | null>(null)
  return (
    <div
      className="scrim"
      onPointerDown={(e) => (down.current = e.target)}
      onClick={(e) => {
        if (e.target === e.currentTarget && down.current === e.currentTarget) onClose()
      }}
    >
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

export function CloseX({ onClose }: { onClose: () => void }) {
  return (
    <button className="icon xclose" onClick={onClose} title="Close" aria-label="Close">
      <XIcon size={18} />
    </button>
  )
}

export function DoneRow({ onClose }: { onClose: () => void }) {
  return (
    <div className="row" style={{ justifyContent: 'flex-end' }}>
      <button className="primary" onClick={onClose}>Done</button>
    </div>
  )
}

export function Err({ msg }: { msg?: string | null }) {
  return msg ? <span className="err">{msg}</span> : null
}

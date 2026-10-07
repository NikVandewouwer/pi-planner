import type { KeyboardEvent } from 'react'

/** Props that make a non-button element behave like a button (click, Enter, Space). */
export function clickable(onClick: () => void) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
        e.preventDefault()
        onClick()
      }
    },
  } as const
}

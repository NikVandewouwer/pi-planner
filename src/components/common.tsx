import type { ReactNode } from 'react'
import type { Art, Member } from '../domain/types'
import { initials, n2, num } from '../domain/util'

const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const PenIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...svg}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
)
export const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...svg}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6" /></svg>
)
export const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...svg}><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const CycleIcon = ({ size = 15, w = 2.2 }: { size?: number; w?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...svg} strokeWidth={w}><path d="M20 11a8 8 0 0 0-14.5-4M4 13a8 8 0 0 0 14.5 4M5 3v4h4M19 21v-4h-4" /></svg>
)
export const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...svg}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
)
export const ThemeIcon = ({ kind }: { kind: 'system' | 'light' | 'dark' }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...svg}>
    {kind === 'system' && <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>}
    {kind === 'light' && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
    {kind === 'dark' && <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
  </svg>
)

export function BrandMark({ className = 'brandmark', id = 'lg2' }: { className?: string; id?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--blue)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${id})`} />
      <rect x="11" y="27" width="6.5" height="10" rx="3.25" fill="#fff" opacity=".92" />
      <rect x="20.75" y="19" width="6.5" height="18" rx="3.25" fill="#fff" opacity=".96" />
      <rect x="30.5" y="11" width="6.5" height="26" rx="3.25" fill="#fff" />
    </svg>
  )
}

/** Info icon with a hover/focus tooltip. */
export function Info({ text, size = 17 }: { text: string; size?: number }) {
  return (
    <span className="info" tabIndex={0} role="note" aria-label={text}>
      <svg width={size} height={size} viewBox="0 0 24 24" {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
      <span className="tip">{text}</span>
    </span>
  )
}

export function Mav({ name, className = 'mav' }: { name: string; className?: string }) {
  return <span className={className}>{initials(name)}</span>
}

export function WhoStack({ ms, max = 5, wt }: { ms: (Member & { role: string })[]; max?: number; wt?: Record<string, number> }) {
  if (!ms.length) return null
  return (
    <span className="who">
      {ms.slice(0, max).map((m) => {
        const w = wt ? num(wt[m.id]) : null
        return (
          <span key={m.id} className="mav" title={`${m.name} · ${m.role}${w != null && w > 0 ? ' · ' + n2(w) + '%' : ''}`}>
            {initials(m.name)}
          </span>
        )
      })}
      {ms.length > max && <span className="more">+{ms.length - max}</span>}
    </span>
  )
}

export function TypeTag({ art, name }: { art: Art; name: string }) {
  const x = art.ftypes.find((y) => y.name === name)
  return (
    <span className="ttag" style={x ? ({ '--tc': `var(--tc${x.c})` } as React.CSSProperties) : undefined} title={name}>
      {name}
    </span>
  )
}

/** Progress bar row used by the tiles and cards. */
export function BarRow({ q, toneName, style, title }: { q: number; toneName: string; style?: React.CSSProperties; title?: string }) {
  return (
    <div className={`barrow t-${toneName}`} style={style} title={title}>
      <div className="bar"><i style={{ width: `${Math.min(100, q)}%` }} /></div>
      <b>{q}%</b>
    </div>
  )
}

/** Compact "done / planned" pill with a mini bar. */
export function Spc({ d, p, q, cls, title, showBar = true }: { d: number; p: number; q: number; cls: string; title: string; showBar?: boolean }) {
  return (
    <span className={`spc ${cls}`} title={title}>
      {showBar && <span className="mini"><i style={{ width: `${Math.min(100, q)}%` }} /></span>}
      <span className="dv">{n2(d)}</span>
      <span className="mute">/</span>
      <span className="pv">{n2(p)}</span>
    </span>
  )
}

export const Dash = () => <span className="mute">{'–'}</span>

export function Empty({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div className="empty" style={style}>{children}</div>
}

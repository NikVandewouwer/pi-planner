import type { ISODate, PI } from './types'

export const uid = () => Math.random().toString(36).slice(2, 9)

/** Lenient number parse: accepts "1,5", returns null for empty/invalid. */
export const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? null : n
}

export const n2 = (x: number) => Number(x.toFixed(2))

export const initials = (s: string) => {
  const w = String(s || '').trim().split(/[\s._-]+/).filter(Boolean)
  if (!w.length) return '?'
  const f = [...w[0]][0] || ''
  const l = w.length > 1 ? [...w[w.length - 1]][0] || '' : ''
  return (f + l).toUpperCase()
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/* ---------- dates (all UTC, ISO YYYY-MM-DD) ---------- */

const parts = (iso: ISODate) => iso.split('-').map(Number) as [number, number, number]

export const addDays = (iso: ISODate, n: number): ISODate => {
  const [y, m, d] = parts(iso)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export const toMonday = (iso: ISODate): ISODate => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export const nextMonday = (today = new Date()): ISODate => {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return addDays(toMonday(iso), 7)
}

export const piEnd = (p: Pick<PI, 'start' | 'sprints' | 'weeks'>): ISODate => addDays(p.start, p.sprints * p.weeks * 7 - 1)

/** Working days (Mon–Fri) of each sprint. */
export function piSprints(pi: Pick<PI, 'start' | 'sprints' | 'weeks'> | null | undefined): ISODate[][] {
  if (!pi || !pi.start) return []
  const [y, m, d] = parts(pi.start)
  const out: ISODate[][] = []
  for (let s = 0; s < pi.sprints; s++) {
    const days: ISODate[] = []
    for (let i = 0; i < pi.weeks * 7; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + s * pi.weeks * 7 + i))
      const wd = dt.getUTCDay()
      if (wd > 0 && wd < 6) days.push(dt.toISOString().slice(0, 10))
    }
    out.push(days)
  }
  return out
}

export const fmt = (iso: ISODate) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
export const sd = (iso: ISODate) => {
  const [, m, d] = iso.split('-')
  return `${+d}/${+m}`
}
export const wd = (iso: ISODate) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })

/* ---------- availability values ---------- */

export const vcls = (v: number) => (v === 1 ? 'v1' : v === 0.75 ? 'v75' : v === 0.5 ? 'v5' : v === 0.25 ? 'v25' : 'v0')
export const vlabel = (v: number) => (v === 0 ? '0' : String(v).replace(/^0\./, '.'))

/** Traffic-light tone for availability percentages. */
export const tone = (q: number) => (q >= 80 ? 'good' : q >= 60 ? 'warn' : 'bad')

/** Default start of the next PI: right after the latest one, or next Monday. */
export function nextPIStart(a: { pis: Pick<PI, 'start' | 'sprints' | 'weeks'>[] }): ISODate {
  const l = [...a.pis].sort((x, y) => x.start.localeCompare(y.start)).pop()
  if (!l) return nextMonday()
  return addDays(l.start, l.sprints * l.weeks * 7)
}

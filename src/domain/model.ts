import { DEFAULT_VELOCITY, PLATFORMS } from './constants'
import type { Art, AvailMap, DayOff, Feature, ISODate, Member, PI, Platform, Role, Team } from './types'
import { num, piEnd, piSprints } from './util'

export const fpts = (f: Feature, pl: Platform) => num(f.pts?.[pl]) || 0
export const ftotal = (f: Feature) => PLATFORMS.reduce((x, pl) => x + fpts(f, pl), 0)
export const fdel = (f: Feature, pl: Platform) => num(f.del?.[pl]) || 0
export const fdelT = (f: Feature) => PLATFORMS.reduce((x, pl) => x + fdel(f, pl), 0)
export const hasAnyDel = (f: Feature) => PLATFORMS.some((pl) => f.del && f.del[pl] != null)

export const tvel = (tm: Team, pl: Platform) => {
  const v = tm.velocity as unknown
  const n = v && typeof v === 'object' ? num((v as Record<string, unknown>)[pl]) : num(v)
  return n == null ? DEFAULT_VELOCITY : n
}

const platRank = (pl: string) => {
  const i = PLATFORMS.indexOf(pl as Platform)
  return i < 0 ? PLATFORMS.length : i
}

export interface PlanRow {
  t: Team
  pl: Platform
  /** Number of earlier PIs with delivered points */
  n: number
  hist: number | null
  tv: number
  /** Velocity used for the forecast */
  rate: number
  /** Available planning days */
  pd: number
  basis: 'history' | 'default'
  /** Forecast story points */
  fc: number
  committed: number
  total: number
}

export interface PlanStats {
  pi: PI
  past: PI[]
  rows: PlanRow[]
}

/**
 * Read-only view over one Agile Release Train plus availability.
 * Mirrors the helpers of the original single-file app (getA, sum, work, nvel, ...).
 */
export class Model {
  readonly teamOf: Record<string, string> = {}
  private readonly roles = new Map<string, Role>()
  private readonly closedCache = new Map<string, DayOff | null>()
  readonly art: Art
  readonly avail: AvailMap

  constructor(art: Art, avail: AvailMap) {
    this.art = art
    this.avail = avail
    art.teams.forEach((t) => t.members.forEach((m) => (this.teamOf[m.id] = t.id)))
    art.roles.forEach((r) => this.roles.set(r.name, r))
  }

  /* ---------- roles ---------- */

  isPlanned = (roleName: string) => !!this.roles.get(roleName)?.planned
  platOf = (roleName: string): Platform | '' => this.roles.get(roleName)?.platform || ''

  sortedRoles = () =>
    this.art.roles
      .slice()
      .sort(
        (a, b) =>
          +!!a.planned - +!!b.planned ||
          (a.planned ? platRank(a.platform) - platRank(b.platform) : 0) ||
          a.name.localeCompare(b.name),
      )

  sortedMembers = (ms: Member[]) =>
    ms
      .map((m, i) => [m, i] as const)
      .sort((x, y) => +this.isPlanned(x[0].role) - +this.isPlanned(y[0].role) || x[1] - y[1])
      .map((x) => x[0])

  usedRole = (name: string) => this.art.teams.reduce((x, t) => x + t.members.filter((m) => m.role === name).length, 0)
  missPlat = () => this.art.roles.filter((r) => r.planned && !r.platform)

  allMembers = () => this.art.teams.flatMap((t) => t.members.map((m) => ({ ...m, team: t.name, tid: t.id })))

  findMember = (id: string): { m: Member; tm: Team } | null => {
    for (const tm of this.art.teams) {
      const m = tm.members.find((x) => x.id === id)
      if (m) return { m, tm }
    }
    return null
  }

  /* ---------- availability ---------- */

  closedFor = (tid: string | undefined, date: ISODate): DayOff | undefined => {
    const key = `${tid}|${date}`
    const hit = this.closedCache.get(key)
    if (hit !== undefined) return hit ?? undefined
    let res: DayOff | null = null
    for (const p of this.art.pis) {
      if (date < p.start || date > piEnd(p)) continue
      const o = (p.off || []).find((o) => (o.scope === 'all' || o.scope === tid) && date >= o.from && date <= o.to)
      if (o) {
        res = o
        break
      }
    }
    this.closedCache.set(key, res)
    return res ?? undefined
  }

  getA = (mid: string, date: ISODate): number => {
    if (this.closedFor(this.teamOf[mid], date)) return 0
    const v = (this.avail[mid] || {})[date]
    return v === undefined ? 1 : v
  }

  /** Available days (sum of availability values). */
  sum = (mid: string, days: ISODate[]) => days.reduce((a, d) => a + this.getA(mid, d), 0)
  /** Working days (not closed by days off). */
  work = (mid: string, days: ISODate[]) => days.filter((d) => !this.closedFor(this.teamOf[mid], d)).length

  cap = (list: { id: string }[], days: ISODate[]) => ({
    a: list.reduce((x, m) => x + this.sum(m.id, days), 0),
    w: list.reduce((x, m) => x + this.work(m.id, days), 0),
  })

  /* ---------- velocity & forecast ---------- */

  planDays = (pi: PI, tm: Team, pl?: Platform | null) => {
    const days = piSprints(pi).flat()
    const ms = tm.members.filter((m) => this.isPlanned(m.role) && (pl == null || this.platOf(m.role) === pl))
    return { a: ms.reduce((x, m) => x + this.sum(m.id, days), 0), w: ms.reduce((x, m) => x + this.work(m.id, days), 0) }
  }

  delivered = (p: PI, tms: Team[], pl: Platform | null) =>
    tms.reduce((s, t) => s + p.features.filter((f) => f.team === t.id).reduce((x, f) => x + (pl ? fdel(f, pl) : fdelT(f)), 0), 0)

  hasDeliv = (p: PI, tms: Team[], pl: Platform | null) =>
    tms.some((t) => p.features.some((f) => f.team === t.id && (pl ? f.del && f.del[pl] != null : hasAnyDel(f))))

  /** Normalised velocity of a PI: delivered SP per 100 planning days. */
  nvel = (p: PI, tms: Team[], pl: Platform | null): number | null => {
    const ts = tms.filter((t) => this.hasDeliv(p, [t], pl))
    if (!ts.length) return null
    const d = ts.reduce((s, t) => s + this.planDays(p, t, pl).a, 0)
    return d > 0 ? (this.delivered(p, ts, pl) / d) * 100 : null
  }

  planStats = (pi: PI, teams: Team[]): PlanStats => {
    const past = this.art.pis.filter((p) => p !== pi && p.start < pi.start).sort((x, y) => x.start.localeCompare(y.start))
    const rows: PlanRow[] = []
    teams.forEach((tm) =>
      PLATFORMS.forEach((pl) => {
        const has = tm.members.some((m) => this.isPlanned(m.role) && this.platOf(m.role) === pl)
        const fs = pi.features.filter((f) => f.team === tm.id)
        if (!has && !fs.some((f) => fpts(f, pl) > 0)) return
        const vals = past.map((p) => this.nvel(p, [tm], pl)).filter((v): v is number => v != null)
        const hist = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null
        const tv = tvel(tm, pl)
        const rate = hist != null ? hist : tv
        const pd = this.planDays(pi, tm, pl).a
        rows.push({
          t: tm,
          pl,
          n: vals.length,
          hist,
          tv,
          rate,
          pd,
          basis: hist != null ? 'history' : 'default',
          fc: (rate * pd) / 100,
          committed: fs.filter((f) => f.status === 'Committed').reduce((x, f) => x + fpts(f, pl), 0),
          total: fs.reduce((x, f) => x + fpts(f, pl), 0),
        })
      }),
    )
    return { pi, past, rows }
  }

  /* ---------- features ---------- */

  /** Planning members of a team on the given platforms. */
  ftMembers = (tid: string, pls: Platform[]) => {
    const tm = this.art.teams.find((x) => x.id === tid)
    return tm ? tm.members.filter((m) => this.isPlanned(m.role) && pls.includes(this.platOf(m.role) as Platform)) : []
  }

  fAsg = (f: Feature) => {
    const tm = this.art.teams.find((x) => x.id === f.team)
    if (!tm) return []
    const ids = f.who || []
    return tm.members.filter((m) => ids.includes(m.id))
  }

  /** Sum of weights per platform, and how far it is from 100%. */
  wtInfo = (f: Feature) => {
    const tm = this.art.teams.find((x) => x.id === f.team)
    const out: { pl: Platform; w: number; diff: number }[] = []
    if (!tm) return out
    PLATFORMS.forEach((pl) => {
      let w = 0
      let any = false
      tm.members.forEach((m) => {
        if ((f.who || []).includes(m.id) && this.isPlanned(m.role) && this.platOf(m.role) === pl) {
          const n = num((f.wt || {})[m.id])
          if (n != null && n > 0) {
            w += n
            any = true
          }
        }
      })
      if (any) {
        w = Math.round(w * 10) / 10
        out.push({ pl, w, diff: Math.round((100 - w) * 10) / 10 })
      }
    })
    return out
  }
}

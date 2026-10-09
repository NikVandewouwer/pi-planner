import { tvel, type Model, type PlanStats } from './model'
import type { Feature, ISODate, PI, Platform, Team } from './types'
import { num, piSprints } from './util'

export interface PlanCard {
  f: Feature
  tm: Team
  /** Member ids working on it in this sprint; null when the feature has no points */
  who: string[] | null
  /** Continues in a later sprint */
  part?: boolean
}

export interface Plan {
  sp: ISODate[][]
  /** team|platform -> capacity per sprint */
  cap: Record<string, number[]>
  /** team|platform -> capacity left per sprint */
  left: Record<string, number[]>
  /** Cards per sprint column */
  cols: PlanCard[][]
  /** Features that do not fit this PI */
  over: PlanCard[]
  /** member -> capacity per sprint */
  mcap: Record<string, number[]>
  /** member -> capacity left per sprint */
  mleft: Record<string, number[]>
  /** member -> SP of their weighted share that did not fit */
  short: Record<string, number>
}

const EPS = 1e-6
const ORDER: Record<string, number> = { Committed: 0, Uncommitted: 1, New: 2 }

/**
 * Greedy sprint planner. Every planning member carries their own capacity per sprint
 * (available days × their platform's velocity ÷ 100). Features are placed in priority order
 * (Committed, Uncommitted, New). Each platform that builds a feature carries that feature's
 * full estimate in parallel (iOS and Android both build the whole 32 SP Mobile ticket).
 * Within a platform, weighted shares go first on each person's own capacity, the rest on
 * assigned people without a weight, or on everyone of that platform.
 */
export function buildPlan(model: Model, ps: PlanStats, pi: PI, teams: Team[]): Plan {
  const sp = piSprints(pi)
  const rateOf = (tm: Team, pl: Platform) => {
    const row = ps.rows.find((r) => r.t.id === tm.id && r.pl === pl)
    return row ? row.rate : tvel(tm, pl)
  }
  // capacity per person per platform: someone on two platforms (a QA testing iOS and Android)
  // gives each of them half their days
  const slot = (id: string, pl: Platform) => id + '|' + pl
  const scap: Record<string, number[]> = {}
  const sleft: Record<string, number[]> = {}
  const pool: Record<string, string[]> = {}
  teams.forEach((tm) => {
    model.platforms.forEach((pl) => (pool[tm.id + '|' + pl] = []))
    tm.members.forEach((m) => {
      if (!model.isPlanned(m.role)) return
      model.platsOf(m.role).forEach((pl) => {
        const sh = model.share(m.role, pl)
        scap[slot(m.id, pl)] = sp.map((d) => (rateOf(tm, pl) * sh * model.sum(m.id, d)) / 100)
        sleft[slot(m.id, pl)] = scap[slot(m.id, pl)].slice()
        pool[tm.id + '|' + pl].push(m.id)
      })
    })
  })
  const capOf = (tid: string, pl: Platform, i: number, src: Record<string, number[]>) =>
    (pool[tid + '|' + pl] || []).reduce((x, id) => x + (src[slot(id, pl)] || [])[i], 0)

  const cap: Record<string, number[]> = {}
  const left: Record<string, number[]> = {}
  teams.forEach((tm) => model.platforms.forEach((pl) => (cap[tm.id + '|' + pl] = sp.map((_, i) => capOf(tm.id, pl, i, scap)))))

  const cols: PlanCard[][] = sp.map(() => [])
  const over: PlanCard[] = []
  const short: Record<string, number> = {}

  teams.forEach((tm) => {
    const fs = pi.features
      .filter((f) => f.team === tm.id)
      .slice()
      .sort((x, y) => (ORDER[x.status] ?? 3) - (ORDER[y.status] ?? 3))
    fs.forEach((f) => {
      let last = -1
      let fits = true
      let work = false
      const used = sp.map(() => new Set<string>())
      // take `amount` SP from these people's remaining capacity on this platform, sprint by sprint; returns what did not fit
      const place = (ids: string[], pl: Platform, amount: number) => {
        let need = amount
        for (let i = 0; i < sp.length && need > EPS; i++) {
          for (const id of ids) {
            if (need <= EPS) break
            const left = sleft[slot(id, pl)]
            const avail = left[i]
            if (avail <= 0) continue
            const use = Math.min(avail, need)
            left[i] -= use
            need -= use
            last = Math.max(last, i)
            used[i].add(id)
          }
        }
        return need > EPS ? need : 0
      }
      model.platforms.forEach((pl) => {
        // each platform builds the whole ticket: it carries the full estimate it shares
        const est = model.fpts(f, pl)
        const poolIds = pool[tm.id + '|' + pl] || []
        if (!est) return
        const share = (id: string) => (est * (num(f.wt[id]) ?? 0)) / 100
        const wIds = (f.who || []).filter((id) => poolIds.includes(id) && (num((f.wt || {})[id]) ?? 0) > 0)
        const wSum = wIds.reduce((x, id) => x + share(id), 0)
        work = true
        // 1. weighted people carry their own share on their own capacity
        wIds.forEach((id) => {
          const rem = place([id], pl, share(id))
          if (rem) {
            fits = false
            short[id] = (short[id] || 0) + rem
          }
        })
        // 2. what is not weighted: assigned people without a weight, else everyone of the platform
        const rest = est - wSum
        if (rest > EPS) {
          const free = (f.who || []).filter((id) => poolIds.includes(id) && !wIds.includes(id))
          const ids = free.length ? free : poolIds
          if (!ids.length) fits = false
          else if (place(ids, pl, rest)) fits = false
        }
      })
      if (!work) {
        if (cols[0]) cols[0].push({ f, tm, who: null })
        return
      }
      if (fits && last >= 0) used.forEach((s, i) => { if (i <= last && s.size) cols[i].push({ f, tm, who: [...s], part: i < last }) })
      else over.push({ f, tm, who: null })
    })
  })
  teams.forEach((tm) => model.platforms.forEach((pl) => (left[tm.id + '|' + pl] = sp.map((_, i) => capOf(tm.id, pl, i, sleft)))))
  // per person, over all their platforms
  const mcap: Record<string, number[]> = {}
  const mleft: Record<string, number[]> = {}
  const add = (into: Record<string, number[]>, from: Record<string, number[]>) =>
    Object.entries(from).forEach(([k, v]) => {
      const id = k.slice(0, k.lastIndexOf('|'))
      into[id] = into[id] ? into[id].map((x, i) => x + v[i]) : v.slice()
    })
  add(mcap, scap)
  add(mleft, sleft)
  return { sp, cap, left, cols, over, mcap, mleft, short }
}

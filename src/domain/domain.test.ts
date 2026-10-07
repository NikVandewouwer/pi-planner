import { describe, expect, it } from 'vitest'
import { migrate } from './migrate'
import { Model } from './model'
import { buildPlan } from './plan'
import type { Art, Feature, PI } from './types'
import { addDays, nextMonday, nextPIStart, piEnd, piSprints, toMonday } from './util'

const feature = (o: Partial<Feature>): Feature => ({
  id: 'f', name: 'F', team: 't1', type: 'Feature', size: 'M', status: 'Committed', spill: false,
  platforms: ['Frontend'], pts: {}, del: {}, who: [], wt: {}, wtU: 'pct', ...o,
})

const pi = (o: Partial<PI> = {}): PI => ({ id: 'p1', name: 'PI 1', start: '2026-01-05', sprints: 2, weeks: 2, off: [], features: [], ...o })

const art = (pis: PI[]): Art => ({
  id: 'a1',
  name: 'Train',
  roles: [
    { id: 'r1', name: 'Frontend developer', planned: true, platform: 'Frontend' },
    { id: 'r2', name: 'Scrum Master', planned: false, platform: '' },
  ],
  ftypes: [{ id: 'ft', name: 'Feature', c: 0 }],
  teams: [{
    id: 't1', name: 'Vega', velocity: { Frontend: 30, Backend: 30 },
    members: [
      { id: 'm1', name: 'Ada Lovelace', role: 'Frontend developer' },
      { id: 'm2', name: 'Grace Hopper', role: 'Frontend developer' },
      { id: 'm3', name: 'Sam', role: 'Scrum Master' },
    ],
  }],
  pis,
})

describe('dates', () => {
  it('snaps to Monday', () => {
    expect(toMonday('2026-01-08')).toBe('2026-01-05') // Thursday
    expect(toMonday('2026-01-05')).toBe('2026-01-05')
    expect(toMonday('2026-01-11')).toBe('2026-01-05') // Sunday
  })
  it('next Monday is strictly in the future', () => {
    expect(nextMonday(new Date(2026, 0, 5))).toBe('2026-01-12') // a Monday
    expect(nextMonday(new Date(2026, 0, 7))).toBe('2026-01-12')
  })
  it('builds sprints of working days', () => {
    const sp = piSprints(pi())
    expect(sp).toHaveLength(2)
    expect(sp[0]).toHaveLength(10)
    expect(sp[0][0]).toBe('2026-01-05')
    expect(sp[0][9]).toBe('2026-01-16')
    expect(sp[1][0]).toBe('2026-01-19')
    expect(piEnd(pi())).toBe('2026-02-01')
  })
  it('defaults the next PI to right after the latest', () => {
    expect(nextPIStart({ pis: [pi()] })).toBe(addDays('2026-01-05', 28))
  })
})

describe('availability', () => {
  it('defaults to 1 and honours days off per scope', () => {
    const p = pi({ off: [{ id: 'o', name: 'Holiday', from: '2026-01-06', to: '2026-01-07', scope: 'all' }] })
    const m = new Model(art([p]), { m1: { '2026-01-08': 0.5 } })
    expect(m.getA('m1', '2026-01-05')).toBe(1)
    expect(m.getA('m1', '2026-01-06')).toBe(0)
    expect(m.getA('m1', '2026-01-08')).toBe(0.5)
    const days = piSprints(p)[0]
    expect(m.sum('m1', days)).toBe(7.5)
    expect(m.work('m1', days)).toBe(8)
  })
  it('counts only planning roles in planning days', () => {
    const p = pi()
    const a = art([p])
    const m = new Model(a, {})
    expect(m.planDays(p, a.teams[0], 'Frontend')).toEqual({ a: 40, w: 40 })
  })
})

describe('velocity', () => {
  it('uses the team default without history, the average of earlier PIs with it', () => {
    const past = pi({ id: 'p0', name: 'PI 0', start: '2025-12-08', features: [feature({ pts: { Frontend: 20 }, del: { Frontend: 20 } })] })
    const cur = pi()
    const a = art([past, cur])
    const m = new Model(a, {})
    // 20 SP over 40 planning days -> 50 SP per 100 days
    expect(m.nvel(past, a.teams, 'Frontend')).toBe(50)
    const ps = m.planStats(cur, a.teams)
    const fe = ps.rows.find((r) => r.pl === 'Frontend')!
    expect(fe.basis).toBe('history')
    expect(fe.rate).toBe(50)
    expect(fe.fc).toBe(20)

    const fresh = new Model(art([cur]), {}).planStats(cur, a.teams).rows[0]
    expect(fresh.basis).toBe('default')
    expect(fresh.rate).toBe(30)
  })
})

describe('buildPlan', () => {
  it('fills sprints from the start and spills over sprint boundaries', () => {
    // two devs × 10 days × 30 / 100 = 3 SP each per sprint -> 6 SP per sprint
    const p = pi({ features: [feature({ pts: { Frontend: 10 } })] })
    const a = art([p])
    const m = new Model(a, {})
    const plan = buildPlan(m, m.planStats(p, a.teams), p, a.teams)
    expect(plan.cap['t1|Frontend']).toEqual([6, 6])
    expect(plan.cols[0]).toHaveLength(1)
    expect(plan.cols[0][0].part).toBe(true)
    expect(plan.cols[1][0].part).toBe(false)
    expect(plan.over).toHaveLength(0)
    expect(plan.left['t1|Frontend'][1]).toBeCloseTo(2)
  })

  it('puts what does not fit beyond the PI and plans Committed first', () => {
    const p = pi({
      features: [
        feature({ id: 'new', status: 'New', pts: { Frontend: 6 } }),
        feature({ id: 'big', status: 'Committed', pts: { Frontend: 10 } }),
      ],
    })
    const a = art([p])
    const m = new Model(a, {})
    const plan = buildPlan(m, m.planStats(p, a.teams), p, a.teams)
    expect(plan.over.map((c) => c.f.id)).toEqual(['new'])
  })

  it('plans weighted shares on each person and reports what does not fit', () => {
    const p = pi({ features: [feature({ pts: { Frontend: 10 }, who: ['m1', 'm2'], wt: { m1: 80, m2: 20 } })] })
    const a = art([p])
    const m = new Model(a, {})
    const plan = buildPlan(m, m.planStats(p, a.teams), p, a.teams)
    // m1 needs 8 SP but has 6 over the PI
    expect(plan.short.m1).toBeCloseTo(2)
    expect(plan.over).toHaveLength(1)
  })
})

describe('migrate', () => {
  it('upgrades the oldest single-train format', () => {
    const { S, ui } = migrate({
      S: {
        art: 'Old train',
        teams: [{ id: 't1', name: 'Vega', velocity: 25, members: [{ id: 'm1', name: 'Ada', role: 'Mobile dev' }] }],
        pi: { name: '2025.1', start: '2025-01-06', sprints: 5, weeks: 2 },
        avail: {},
        done: true,
      },
      ui: { gf: { platform: 'Mobile' } },
    })
    expect(S.arts).toHaveLength(1)
    const a = S.arts[0]
    expect(a.name).toBe('Old train')
    expect(a.teams[0].velocity).toEqual({ Frontend: 25, Backend: 25 })
    expect(a.pis[0].features).toEqual([])
    // unknown member roles are added, default roles are created
    expect(a.roles.some((r) => r.name === 'Mobile dev')).toBe(true)
    expect(a.roles.find((r) => r.name === 'Frontend developer')?.platform).toBe('Frontend')
    expect(a.ftypes.map((x) => x.name)).toContain('Feature')
    expect(S.artId).toBe(a.id)
    expect(ui.gf?.platform).toBe('Frontend')
  })

  it('converts story-point weights to percentages and Mobile to Frontend', () => {
    const { S } = migrate({
      S: {
        arts: [{
          id: 'a', name: 'A', roles: [{ id: 'r', name: 'Dev', planned: true, platform: 'Mobile' }], ftypes: [],
          teams: [{ id: 't', name: 'T', velocity: { Mobile: 40 }, members: [{ id: 'm', name: 'M', role: 'Dev' }] }],
          pis: [{ id: 'p', name: 'P', start: '2026-01-05', sprints: 1, weeks: 1, features: [{ id: 'f', name: 'F', team: 't', pts: { Mobile: 10 }, who: ['m'], wt: { m: 5 } }] }],
        }],
        avail: {}, artId: 'a', done: true,
      },
    })
    const f = S.arts[0].pis[0].features[0]
    expect(S.arts[0].teams[0].velocity.Frontend).toBe(40)
    expect(f.pts).toEqual({ Frontend: 10 })
    expect(f.wt).toEqual({ m: 50 })
    expect(f.platforms).toEqual(['Frontend'])
  })

  it('starts empty on garbage', () => {
    expect(migrate(null).S.arts).toEqual([])
    expect(migrate('nope').S.done).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { addPlatform, addToFeaturesOfEst, linkPlatform, missingFromEst, renamePlatform } from '../state/actions'
import { migrate, newArt } from './migrate'
import { Model } from './model'
import { buildPlan, planLanes, type PlanCard } from './plan'
import { addArts, applyDoc, docHash, draftId, fromRow, removeArt, trainDoc } from './sync'
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
    { id: 'r1', name: 'Frontend developer', planned: true, platforms: ['Frontend'] },
    { id: 'r2', name: 'Scrum Master', planned: false, platforms: [] },
  ],
  ftypes: [{ id: 'ft', name: 'Feature', c: 0 }],
  platforms: [{ id: 'pf', name: 'Frontend', est: 'Frontend' }, { id: 'pb', name: 'Backend', est: 'Backend' }],
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
    // it still starts on the capacity that is left, and continues after the PI
    const started = plan.cols.flat().filter((c) => c.f.id === 'new')
    expect(started.length).toBeGreaterThan(0)
    expect(started.every((c) => c.part)).toBe(true)
    expect(plan.over[0].part).toBe(true)
    // SP per sprint plus what is left after the PI add up to the estimate
    const inPI = started.reduce((x, c) => x + (c.pts?.Frontend ?? 0), 0)
    expect(inPI).toBeGreaterThan(0)
    expect(inPI + (plan.over[0].pts?.Frontend ?? 0)).toBeCloseTo(6)
    const big = plan.cols.flat().filter((c) => c.f.id === 'big')
    expect(big.reduce((x, c) => x + (c.pts?.Frontend ?? 0), 0)).toBeCloseTo(10)
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
    expect(a.roles.find((r) => r.name === 'Frontend developer')?.platforms).toEqual(['Frontend'])
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

/* ---------- parallel platforms: iOS and Android share the Mobile estimate ---------- */

const mobileArt = (pis: PI[]): Art => ({
  id: 'a', name: 'A', ftypes: [], pis,
  platforms: [{ id: 'p1', name: 'iOS', est: 'Mobile' }, { id: 'p2', name: 'Android', est: 'Mobile' }, { id: 'p3', name: 'Backend', est: 'Backend' }],
  roles: [
    { id: 'r1', name: 'iOS Engineer', planned: true, platforms: ['iOS'] },
    { id: 'r2', name: 'Android Engineer', planned: true, platforms: ['Android'] },
  ],
  teams: [{ id: 't1', name: 'Mobile', velocity: { iOS: 30, Android: 30, Backend: 30 }, members: [{ id: 'ios', name: 'I', role: 'iOS Engineer' }, { id: 'and', name: 'A', role: 'Android Engineer' }] }],
})
const mobileFeature = (o: Partial<Feature> = {}) => feature({ platforms: ['iOS', 'Android'], pts: { Mobile: 32 }, who: ['ios', 'and'], wt: { ios: 100, and: 100 }, ...o })

describe('parallel platforms', () => {
  const past = pi({ id: 'p0', name: 'PI 0', start: '2025-12-01', features: [mobileFeature({ del: { Mobile: 32 } })] })
  const cur = pi({ features: [mobileFeature()] })
  const a = mobileArt([past, cur])
  const m = new Model(a, {})

  it('credits every platform with the whole ticket it built', () => {
    // 32 SP delivered over 20 iOS days -> 160 per 100 days, same for Android
    expect(m.nvel(past, a.teams, 'iOS')).toBe(160)
    expect(m.nvel(past, a.teams, 'Android')).toBe(160)
  })

  it('counts a ticket once in totals', () => {
    expect(m.ftotal(cur.features[0])).toBe(32)
    expect(m.fpts(cur.features[0], 'iOS')).toBe(32)
    expect(m.fpts(cur.features[0], 'Android')).toBe(32)
    expect(m.fpts(cur.features[0], 'Backend')).toBe(0)
  })

  it('plans the same ticket in parallel on iOS and Android, and it fits', () => {
    const ps = m.planStats(cur, a.teams)
    expect(ps.rows.map((r) => [r.pl, r.fc, r.committed])).toEqual([['iOS', 32, 32], ['Android', 32, 32]])
    const plan = buildPlan(m, ps, cur, a.teams)
    expect(plan.over).toHaveLength(0)
    expect(plan.short).toEqual({})
    // both people are busy on it in both sprints
    expect(plan.cols[0][0].who?.sort()).toEqual(['and', 'ios'])
    expect(plan.cols[1][0].part).toBe(false)
  })

  it('does not let Android pick up iOS work', () => {
    // iOS engineer is away for the whole PI: the ticket can't finish, Android capacity can't help
    const days = piSprints(cur).flat()
    const away = new Model(a, { ios: Object.fromEntries(days.map((d) => [d, 0])) })
    const plan = buildPlan(away, away.planStats(cur, a.teams), cur, a.teams)
    expect(plan.over).toHaveLength(1)
    expect(plan.short.ios).toBe(32)
  })
})

describe('platform settings', () => {
  it('starts new trains with iOS and Android sharing Mobile', () => {
    expect(newArt().platforms.map((p) => [p.name, p.est])).toEqual([['iOS', 'Mobile'], ['Android', 'Mobile'], ['Backend', 'Backend']])
  })

  it('turns a legacy Frontend into iOS + Android without losing points', () => {
    const a = art([pi({ features: [feature({ platforms: ['Frontend'], pts: { Frontend: 32 }, del: { Frontend: 30 } })] })])
    expect(renamePlatform(a, 'pf', 'iOS')).toBeNull()
    expect(addPlatform(a, 'Android', 'pf')).toBeNull() // estimated together with iOS
    expect(addPlatform(a, 'ios')).toMatch(/already exists/)
    const f = a.pis[0].features[0]
    const m = new Model(a, {})
    expect(a.roles[0].platforms).toEqual(['iOS'])
    expect(a.teams[0].velocity).toMatchObject({ iOS: 30, Android: 30 })
    expect(a.platforms.map((p) => p.name)).toEqual(['iOS', 'Android', 'Backend'])
    expect(m.partnersOf('iOS')).toEqual(['Android'])
    expect(m.estLabel(m.estOf('Android'))).toBe('iOS + Android')
    expect(m.fpts(f, 'iOS')).toBe(32)
    // the old ticket was built by both: add Android so its velocity history counts it
    const android = a.platforms.find((p) => p.name === 'Android')!.id
    expect(missingFromEst(a, android)).toHaveLength(1)
    addToFeaturesOfEst(a, android)
    expect(f.platforms).toEqual(['iOS', 'Android'])
    expect(missingFromEst(a, android)).toHaveLength(0)
  })

  it('links and unlinks platforms without losing points', () => {
    const a = mobileArt([pi({ features: [mobileFeature({ platforms: ['iOS', 'Android', 'Backend'], pts: { Mobile: 32, Backend: 8 } })] })])
    const f = a.pis[0].features[0]
    // Android on its own: it keeps the 32 as its own estimate, the ticket now has two numbers
    linkPlatform(a, 'p2', null)
    let m = new Model(a, {})
    expect(m.partnersOf('Android')).toEqual([])
    expect(m.fpts(f, 'iOS')).toBe(32)
    expect(m.fpts(f, 'Android')).toBe(32)
    expect(m.ftotal(f)).toBe(72)
    // Backend together with iOS: it takes the iOS estimate, its own 8 is dropped
    linkPlatform(a, 'p3', 'p1')
    m = new Model(a, {})
    expect(m.partnersOf('iOS')).toEqual(['Backend'])
    expect(a.platforms.map((p) => p.name)).toEqual(['iOS', 'Backend', 'Android'])
    expect(m.fpts(f, 'Backend')).toBe(32)
    expect(m.ftotal(f)).toBe(64)
  })

  it('gives legacy data Frontend and Backend, each with its own estimate', () => {
    const { S } = migrate({ S: { arts: [{ id: 'a', name: 'A', teams: [], pis: [], roles: [] }], avail: {}, artId: 'a', done: true } })
    expect(S.arts[0].platforms.map((p) => [p.name, p.est])).toEqual([['Frontend', 'Frontend'], ['Backend', 'Backend']])
  })
})

describe('roles across platforms', () => {
  // an iOS dev, an Android dev and a QA who tests both: the QA gives each platform half their days
  const qaArt = (pis: PI[]): Art => {
    const a = mobileArt(pis)
    a.roles.push({ id: 'r3', name: 'Mobile QA', planned: true, platforms: ['iOS', 'Android'] })
    a.teams[0].members.push({ id: 'qa', name: 'Q', role: 'Mobile QA' })
    return a
  }
  // the QA is assigned too, without weights: the work is spread over whoever has capacity
  const team = { who: ['ios', 'and', 'qa'], wt: {} }
  const past = pi({ id: 'p0', name: 'PI 0', start: '2025-12-01', features: [mobileFeature({ del: { Mobile: 32 }, ...team })] })
  const cur = pi({ features: [mobileFeature(team)] })
  const a = qaArt([past, cur])

  it('splits the QA days evenly over their platforms', () => {
    const m = new Model(a, {})
    expect(m.share('Mobile QA', 'iOS')).toBe(0.5)
    // 20 dev days + half of 20 QA days
    expect(m.planDays(cur, a.teams[0], 'iOS').a).toBe(30)
    expect(m.planDays(cur, a.teams[0], 'Android').a).toBe(30)
    // the whole team still counts each person once
    expect(m.planDays(cur, a.teams[0], null).a).toBe(60)
  })

  it('plans the same ticket as last time when everyone is there', () => {
    const m = new Model(a, {})
    const ps = m.planStats(cur, a.teams)
    expect(ps.rows.map((r) => [r.pl, Math.round(r.fc)])).toEqual([['iOS', 32], ['Android', 32]])
    const plan = buildPlan(m, ps, cur, a.teams)
    expect(plan.over).toHaveLength(0)
    // the QA works on both platforms in the board
    expect(plan.cols.flat().some((c) => c.who?.includes('qa'))).toBe(true)
    expect(plan.mcap.qa.reduce((x, y) => x + y, 0)).toBeCloseTo(32 / 30 * 100 * 20 / 100) // all their days, at the platforms' velocity
  })

  it('loses capacity on both platforms when the QA is away', () => {
    const days = piSprints(cur).flat()
    const m = new Model(a, { qa: Object.fromEntries(days.map((d) => [d, 0])) })
    const ps = m.planStats(cur, a.teams)
    expect(ps.rows.map((r) => Math.round(r.fc * 10) / 10)).toEqual([21.3, 21.3])
    expect(buildPlan(m, ps, cur, a.teams).over).toHaveLength(1)
  })

  it('migrates a single platform to a list', () => {
    const { S } = migrate({ S: { arts: [{ id: 'a', name: 'A', teams: [], pis: [], roles: [{ id: 'r', name: 'QA', planned: true, platform: 'Backend' }] }], avail: {}, artId: 'a', done: true } })
    expect(S.arts[0].roles[0].platforms).toEqual(['Backend'])
  })
})

describe('sync', () => {
  const two = () => {
    const a = art([pi()])
    const b: Art = { ...structuredClone(a), id: 'a2', name: 'Other', teams: [{ id: 't2', name: 'Lyra', velocity: {}, members: [{ id: 'm9', name: 'Lin', role: 'Frontend developer' }] }] }
    return migrate({ S: { arts: [a, b], artId: 'a1', done: true, avail: { m1: { '2026-01-05': 0.5 }, m9: { '2026-01-06': 0 } } } }).S
  }

  it('splits availability per train', () => {
    const S = two()
    expect(trainDoc(S, S.arts[0]).avail).toEqual({ m1: { '2026-01-05': 0.5 } })
    expect(trainDoc(S, S.arts[1]).avail).toEqual({ m9: { '2026-01-06': 0 } })
  })

  it('hashes content, not identity', () => {
    const S = two()
    const h = docHash(S, S.arts[0])
    expect(docHash(structuredClone(S), structuredClone(S.arts[0]))).toBe(h)
    S.avail.m2 = { '2026-01-07': 0 }
    expect(docHash(S, S.arts[0])).not.toBe(h)
    expect(docHash(S, S.arts[1])).toBe(docHash(two(), two().arts[1]))
  })

  it('applies a remote train over the local one, including removed members', () => {
    const S = two()
    const remote = structuredClone(S.arts[0])
    remote.name = 'Renamed'
    remote.teams[0].members = remote.teams[0].members.filter((m) => m.id !== 'm1')
    applyDoc(S, { id: 'a1', name: 'Renamed', art: remote, avail: { m2: { '2026-01-05': 0 } } })
    expect(S.arts.map((a) => a.name)).toEqual(['Renamed', 'Other'])
    expect(S.avail.m1).toBeUndefined()
    expect(S.avail.m2).toEqual({ '2026-01-05': 0 })
    expect(S.avail.m9).toBeDefined()
  })

  it('reads rows through migrate', () => {
    const doc = fromRow({ id: 'x', art: { name: 'Old', teams: [{ id: 't', name: 'T', velocity: 20, members: [] }] }, avail: null })
    expect(doc?.id).toBe('x')
    expect(doc?.art.platforms.length).toBeGreaterThan(0)
    expect(fromRow({ id: 'x', art: null, avail: null })).toBeNull()
  })

  it('removes and adds trains', () => {
    const S = two()
    const copy = structuredClone(S)
    removeArt(S, 'a1')
    expect(S.arts.map((a) => a.id)).toEqual(['a2'])
    expect(S.artId).toBe('a2')
    expect(S.avail.m1).toBeUndefined()
    expect(addArts(S, copy)).toBe(1)
    expect(addArts(S, copy)).toBe(0)
    expect(S.avail.m1).toEqual({ '2026-01-05': 0.5 })
  })

  it('keeps the train in the wizard as a draft', () => {
    const { S, ui } = migrate(null)
    expect(draftId({ ...S, artId: 'a' }, ui)).toBe('a')
    expect(draftId({ ...S, artId: 'a', done: true }, ui)).toBeNull()
    expect(draftId({ ...S, artId: 'a', done: true }, { ...ui, wizard: true })).toBe('a')
  })
})

describe('planLanes', () => {
  const tm = art([]).teams[0]
  const card = (id: string): PlanCard => ({ f: feature({ id }), tm, who: [] })
  it('gives every feature its own row over all its sprints', () => {
    // A runs sprints 1-3, B 1-2, C 3-4, D only in 4
    const cols = [[card('A'), card('B')], [card('A'), card('B')], [card('C'), card('A')], [card('C'), card('D')]]
    const { lanes, rows } = planLanes(cols)
    expect(lanes).toEqual([[0, 1], [0, 1], [2, 0], [2, 3]])
    expect(rows).toBe(4)
  })
})

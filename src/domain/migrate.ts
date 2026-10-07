/* eslint-disable @typescript-eslint/no-explicit-any */
// Upgrades any data shape the app has ever stored (including the original single-file
// version) to the current one. Input is untrusted JSON, hence the `any`s.
import { DEFAULT_FTYPES, DEFAULT_PLANNED, DEFAULT_VELOCITY, GF0, PLATFORMS, ROLES } from './constants'
import { Model } from './model'
import type { Art, Data, Platform, UI } from './types'
import { num, piEnd, uid } from './util'

export const emptyData = (): Data => ({ arts: [], avail: {}, artId: null, piId: null, done: false })
export const defaultUI = (): UI => ({ step: 1, view: 'plan', setupTab: 'teams', team: 'all', paint: 'cycle', mainTab: 'availability', modal: null, menu: false })

export const nextTypeColor = (a: Pick<Art, 'ftypes'>) => {
  const u = new Set(a.ftypes.map((x) => x.c).filter((c) => typeof c === 'number'))
  for (let i = 0; i < 8; i++) if (!u.has(i)) return i
  return a.ftypes.length % 8
}

export const newArt = (): Art => {
  const a: Art = { id: uid(), name: '', teams: [], pis: [], roles: [], ftypes: [] }
  DEFAULT_FTYPES.forEach((name) => a.ftypes.push({ id: uid(), name, c: nextTypeColor(a) }))
  return a
}

const defPlat = (n: string): Platform | '' => (/frontend|mobile|ios|android|web/i.test(n) ? 'Frontend' : /backend/i.test(n) ? 'Backend' : '')

function renamePlat(a: any) {
  const mv = (o: any) => {
    if (o && typeof o === 'object' && o.Mobile !== undefined) {
      if (o.Frontend === undefined) o.Frontend = o.Mobile
      delete o.Mobile
    }
  }
  a.roles?.forEach((r: any) => { if (r.platform === 'Mobile') r.platform = 'Frontend' })
  a.teams.forEach((t: any) => mv(t.velocity))
  a.pis.forEach((p: any) => {
    Object.values(p.velocity || {}).forEach(mv)
    ;(p.features || []).forEach((f: any) => { mv(f.pts); mv(f.del) })
  })
}

/** Normalises one ART in place (port of the original `ensureRoles`). */
export function ensureArt(a: any, avail: Data['avail']): Art {
  a.teams = a.teams || []
  a.pis = a.pis || []
  a.teams.forEach((t: any) => { t.members = t.members || [] })
  renamePlat(a)
  a.teams.forEach((t: any) => {
    if (!t.velocity || typeof t.velocity !== 'object') {
      const v = num(t.velocity)
      t.velocity = {}
      PLATFORMS.forEach((pl) => (t.velocity[pl] = v == null ? DEFAULT_VELOCITY : v))
    }
    delete t.baseline
  })
  if (!a.ftypes) a.ftypes = DEFAULT_FTYPES.map((n) => ({ id: uid(), name: n }))
  a.ftypes.forEach((x: any) => { if (typeof x.c !== 'number') x.c = nextTypeColor(a) })
  a.pis.forEach((p: any) => { p.off = p.off || []; p.features = p.features || [] })
  if (!a.roles) a.roles = ROLES.map((n) => ({ id: uid(), name: n, planned: DEFAULT_PLANNED.includes(n) }))
  a.roles.forEach((r: any) => {
    if (!r.id) r.id = uid()
    if (r.platform === undefined) r.platform = defPlat(r.name)
  })
  a.teams.forEach((t: any) => t.members.forEach((m: any) => {
    if (m.role && !a.roles.some((r: any) => r.name === m.role)) a.roles.push({ id: uid(), name: m.role, planned: false, platform: '' })
  }))

  const model = new Model(a as Art, avail)
  // velocity per PI used to be stored as absolute days; convert to SP per 100 days
  a.pis.forEach((p: any) => {
    if (p.velUnit !== 'md') {
      const nv: any = {}
      Object.keys(p.velocity || {}).forEach((tid) => {
        const tm = a.teams.find((x: any) => x.id === tid)
        const d = num(p.velocity[tid])
        const pd = tm ? model.planDays(p, tm).a : 0
        if (d != null && pd) nv[tid] = Math.round((d / pd) * 1000) / 10
      })
      p.velocity = nv
      p.velUnit = 'md'
    }
  })
  a.pis.forEach((p: any) => {
    p.velocity = p.velocity || {}
    Object.keys(p.velocity).forEach((tid) => {
      const v = p.velocity[tid]
      if (!v || typeof v !== 'object') {
        const n = num(v)
        p.velocity[tid] = {}
        if (n != null) PLATFORMS.forEach((pl) => (p.velocity[tid][pl] = n))
      }
    })
    p.features.forEach((f: any) => {
      if (!f.who) f.who = []
      if (!f.wt || typeof f.wt !== 'object') f.wt = {}
      if (!f.del || typeof f.del !== 'object') f.del = {}
      if (!f.pts) {
        f.pts = {}
        const n = num(f.points)
        if (n != null && n > 0) f.pts[f.platform || PLATFORMS[0]] = n
      }
      delete f.points
      delete f.platform
    })
  })
  // weights used to be story points; convert to % of the platform estimate
  a.pis.forEach((p: any) => p.features.forEach((f: any) => {
    if (f.wtU === 'pct') return
    const tm = a.teams.find((x: any) => x.id === f.team)
    const nw: any = {}
    Object.keys(f.wt || {}).forEach((id) => {
      const m = tm && tm.members.find((x: any) => x.id === id)
      const pl = m && model.platOf(m.role)
      const est = pl ? num((f.pts || {})[pl]) : null
      const sp = num(f.wt[id])
      if (est != null && est > 0 && sp != null && sp > 0) nw[id] = Math.round((sp / est) * 1000) / 10
    })
    f.wt = nw
    f.wtU = 'pct'
  }))
  a.pis.forEach((p: any) => p.features.forEach((f: any) => {
    if (!Array.isArray(f.platforms)) {
      const s = new Set([...Object.keys(f.pts || {}), ...Object.keys(f.del || {})])
      if (!s.size) {
        const tm = a.teams.find((x: any) => x.id === f.team)
        ;(f.who || []).forEach((id: string) => {
          const m = tm && tm.members.find((x: any) => x.id === id)
          const pl = m && model.platOf(m.role)
          if (pl) s.add(pl)
        })
      }
      f.platforms = PLATFORMS.filter((p2) => s.has(p2))
    }
  }))
  return a as Art
}

/**
 * Turns whatever was persisted (or imported) into valid state.
 * Accepts `{S, ui}` (what the app stores) or a bare `S`.
 */
export function migrate(raw: any): { S: Data; ui: UI } {
  let S: any = raw && typeof raw === 'object' && 'S' in raw ? raw.S : raw
  const uiIn: any = raw && typeof raw === 'object' && 'ui' in raw ? raw.ui : {}
  if (!S || typeof S !== 'object') S = emptyData()
  S = structuredClone(S)
  const ui: UI = Object.assign(defaultUI(), uiIn || {})

  // the very first version stored a single train at the top level
  if (!S.arts) {
    S.arts = []
    if (S.art || (S.teams && S.teams.length)) {
      S.arts.push({ id: uid(), name: S.art || 'ART', teams: S.teams || [], pis: S.pi ? [{ id: uid(), ...S.pi }] : [], off: S.off || [] })
    }
    delete S.art; delete S.teams; delete S.pi; delete S.off
  }
  S.avail = S.avail || {}
  S.done = !!S.done
  if (!S.arts.find((a: any) => a.id === S.artId)) S.artId = S.arts[0]?.id ?? null
  // days off used to live on the train; move them into the PI they fall in
  S.arts.forEach((a: any) => {
    a.pis = a.pis || []
    a.pis.forEach((p: any) => (p.off = p.off || []))
    ;(a.off || []).forEach((o: any) => {
      const p = a.pis.find((p: any) => o.to >= p.start && o.from <= piEnd(p)) || a.pis[0]
      if (p) p.off.push(o)
    })
    delete a.off
  })
  S.arts.forEach((a: any) => ensureArt(a, S.avail))

  ui.modal = null
  ui.menu = false
  ui.view = 'plan'
  ui.paint = ui.paint || 'cycle'
  ui.team = ui.team || 'all'
  ui.mainTab = ui.mainTab || 'availability'
  if (!['general', 'roles', 'teams', 'ftypes'].includes(ui.setupTab)) ui.setupTab = 'general'
  ui.gf = Object.assign({}, GF0, ui.gf)
  if ((ui.gf.platform as string) === 'Mobile') ui.gf.platform = 'Frontend'
  return { S: S as Data, ui }
}

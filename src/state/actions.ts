import { VALS } from '../domain/constants'
import { gridScope } from '../domain/grid'
import { emptyData, defaultUI } from '../domain/migrate'
import { Model } from '../domain/model'
import type { Art, DeleteKind, Modal } from '../domain/types'
import { piSprints, uid } from '../domain/util'
import { artOf, piOf, scopeTeamsOf, update, type AppState } from './store'

/* ---------- navigation ---------- */

export const openModal = (modal: Modal) =>
  update(({ ui }) => {
    ui.modal = modal
    ui.statTab = 'sprint'
    ui.piTab = 'details'
    ui.menu = false
  })

export const closeModal = () => update(({ ui }) => { ui.modal = null })

/** Ask for confirmation; Cancel returns to the modal that was open. */
export const ask = (kind: DeleteKind, id = '') =>
  update(({ ui }) => {
    ui.modal = { type: 'ask', kind, id, back: ui.modal }
    ui.menu = false
  })

/** Switch to another ART (and optionally PI) when acting from the menu. */
export function focusArt(d: AppState, artId: string | undefined, piId: string | null) {
  if (artId && artId !== d.S.artId) {
    d.S.artId = artId
    d.S.piId = piId
    d.ui.team = 'all'
  }
}

/* ---------- availability ---------- */

export const paintCell = (mid: string, date: string) =>
  update(({ S, ui }) => {
    const a = artOf(S)
    if (!a) return
    const model = new Model(a, S.avail)
    if (model.closedFor(model.teamOf[mid], date)) return
    const cur = model.getA(mid, date)
    const v = ui.paint === 'cycle' ? VALS[(VALS.indexOf(cur) + 1) % VALS.length] : +ui.paint
    ;(S.avail[mid] = S.avail[mid] || {})[date] = v
  })

/* ---------- platforms ---------- */

const same = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase()

/** Drop platforms and estimates a feature no longer has (after platforms changed). */
function pruneFeatures(a: Art) {
  const estOf = new Map(a.platforms.map((p) => [p.name, p.est]))
  a.pis.forEach((p) => p.features.forEach((f) => {
    f.platforms = f.platforms.filter((pl) => estOf.has(pl))
    const used = new Set(f.platforms.map((pl) => estOf.get(pl)))
    for (const k of ['pts', 'del'] as const) Object.keys(f[k] || {}).forEach((e) => { if (!used.has(e)) delete f[k][e] })
  }))
}

/** A fresh estimate key for a platform estimated on its own. */
const ownEst = (a: Art, name: string) => (a.platforms.some((p) => p.est === name) ? uid() : name)

/**
 * Adds a platform, estimated on its own or together with an existing platform (e.g. Android
 * together with iOS). Returns an error message, or null when added.
 */
export function addPlatform(a: Art, name: string, withId: string | null = null): string | null {
  name = name.trim()
  if (!name) return 'Please enter a name.'
  if (a.platforms.some((p) => same(p.name, name))) return `“${name}” already exists.`
  const partner = withId ? a.platforms.find((p) => p.id === withId) : undefined
  const est = partner ? partner.est : ownEst(a, name)
  // keep platforms that are estimated together next to each other: iOS, Android, Backend
  const last = a.platforms.map((p) => p.est).lastIndexOf(est)
  a.platforms.splice(last < 0 ? a.platforms.length : last + 1, 0, { id: uid(), name, est })
  a.teams.forEach((t) => { if (t.velocity[name] == null) t.velocity[name] = 30 })
  return null
}

/** Estimate a platform together with another one, or on its own (withId null). */
export function linkPlatform(a: Art, id: string, withId: string | null) {
  const p = a.platforms.find((x) => x.id === id)
  if (!p) return
  if (withId) {
    const partner = a.platforms.find((x) => x.id === withId)
    if (partner && partner !== p) setPlatformEst(a, id, partner.est)
  } else if (a.platforms.some((x) => x !== p && x.est === p.est)) {
    setPlatformEst(a, id, ownEst(a, p.name))
  }
  // keep linked platforms together in the list
  const order = a.platforms.filter((x) => x !== p)
  const last = order.map((x) => x.est).lastIndexOf(p.est)
  if (last >= 0) { order.splice(last + 1, 0, p); a.platforms = order }
}

/** Renames a platform everywhere it is referenced. Returns an error message, or null. */
export function renamePlatform(a: Art, id: string, name: string): string | null {
  name = name.trim()
  const p = a.platforms.find((x) => x.id === id)
  if (!p || name === p.name) return null
  if (!name) return 'Please enter a name.'
  if (a.platforms.some((x) => x !== p && same(x.name, name))) return `“${name}” already exists.`
  const old = p.name
  a.roles.forEach((r) => { r.platforms = r.platforms.map((x) => (x === old ? name : x)) })
  a.teams.forEach((t) => {
    if (t.velocity[old] != null) { t.velocity[name] = t.velocity[old]; delete t.velocity[old] }
  })
  a.pis.forEach((pi) => pi.features.forEach((f) => { f.platforms = f.platforms.map((x) => (x === old ? name : x)) }))
  p.name = name
  return null
}

/**
 * Moves a platform to another estimate. Features it builds keep their points: they are
 * copied to the new estimate when that one has none yet. Estimates nobody uses any more are dropped.
 */
export function setPlatformEst(a: Art, id: string, est: string) {
  const p = a.platforms.find((x) => x.id === id)
  est = est.trim()
  if (!p || !est || est === p.est) return
  const old = p.est
  a.pis.forEach((pi) => pi.features.forEach((f) => {
    if (!f.platforms.includes(p.name)) return
    for (const k of ['pts', 'del'] as const) if (f[k][est] == null && f[k][old] != null) f[k][est] = f[k][old]
  }))
  p.est = est
  pruneFeatures(a)
}

/** Features in this train that are sized in the platform's estimate but don't list the platform yet. */
export function missingFromEst(a: Art, id: string) {
  const p = a.platforms.find((x) => x.id === id)
  if (!p) return []
  const others = new Set(a.platforms.filter((x) => x !== p && x.est === p.est).map((x) => x.name))
  return a.pis.flatMap((pi) => pi.features).filter((f) => !f.platforms.includes(p.name) && f.platforms.some((pl) => others.has(pl)))
}

/** Lets a platform build every existing ticket of its estimate in parallel, e.g. Android joining iOS on Mobile. */
export function addToFeaturesOfEst(a: Art, id: string) {
  const p = a.platforms.find((x) => x.id === id)
  if (!p) return
  const order = a.platforms.map((x) => x.name)
  const ids = new Set(missingFromEst(a, id).map((f) => f.id))
  a.pis.forEach((pi) => pi.features.forEach((f) => {
    if (ids.has(f.id)) f.platforms = order.filter((pl) => pl === p.name || f.platforms.includes(pl))
  }))
}

/* ---------- deleting ---------- */

export function doDelete(d: AppState, kind: DeleteKind, id: string) {
  const { S } = d
  const a = artOf(S)
  if (kind === 'reset') {
    d.S = emptyData()
    d.ui = defaultUI()
    return
  }
  if (!a) return
  if (kind === 'platform') {
    const p = a.platforms.find((x) => x.id === id)
    if (p) {
      a.platforms = a.platforms.filter((x) => x !== p)
      a.roles.forEach((r) => { r.platforms = r.platforms.filter((x) => x !== p.name) })
      a.teams.forEach((t) => delete t.velocity[p.name])
      pruneFeatures(a)
    }
  } else if (kind === 'team') {
    const tm = a.teams.find((x) => x.id === id)
    if (tm) {
      tm.members.forEach((m) => delete S.avail[m.id])
      a.teams = a.teams.filter((x) => x.id !== id)
      a.pis.forEach((p) => {
        p.off = p.off.filter((o) => o.scope !== id)
        p.features = p.features.filter((f) => f.team !== id)
      })
    }
  } else if (kind === 'art') {
    const tgt = S.arts.find((x) => x.id === id) || a
    tgt.teams.forEach((x) => x.members.forEach((m) => delete S.avail[m.id]))
    S.arts = S.arts.filter((x) => x.id !== tgt.id)
    if (!S.arts.length) {
      d.S = emptyData()
      d.ui = { ...defaultUI(), theme: d.ui.theme, palette: d.ui.palette }
    } else if (S.artId === tgt.id) {
      S.artId = S.arts[0].id
      S.piId = null
      d.ui.team = 'all'
      d.ui.view = 'plan'
    }
  } else if (kind === 'pi') {
    a.pis = a.pis.filter((p) => p.id !== id)
    if (S.piId === id) S.piId = null
  } else if (kind === 'feature') {
    const pi = piOf(S, a)
    if (pi) pi.features = pi.features.filter((f) => f.id !== id)
  } else if (kind === 'role') a.roles = a.roles.filter((r) => r.id !== id)
  else if (kind === 'ftype') a.ftypes = a.ftypes.filter((x) => x.id !== id)
  else if (kind === 'member') {
    a.teams.forEach((x) => (x.members = x.members.filter((m) => m.id !== id)))
    delete S.avail[id]
  } else if (kind === 'resetAvail') {
    // only what is visible in the grid: the filtered days and members
    const tm = a.teams.find((x) => x.id === id)
    const pi = piOf(S, a)
    if (tm && pi) {
      const g = gridScope(new Model(a, S.avail), pi, scopeTeamsOf(a, d.ui.team), d.ui.gf)
      const days = g.days.length ? g.days : piSprints(pi).flat()
      tm.members.filter(g.passes).forEach((m) => {
        if (S.avail[m.id]) days.forEach((day) => delete S.avail[m.id][day])
      })
    }
  } else if (kind === 'off') a.pis.forEach((p) => (p.off = p.off.filter((o) => o.id !== id)))
}

export const confirmAsk = () =>
  update((d) => {
    const m = d.ui.modal
    if (!m || m.type !== 'ask') return
    doDelete(d, m.kind, m.id)
    const a = artOf(d.S)
    if (d.ui.modal === m) d.ui.modal = (m.kind === 'off' || (m.kind === 'pi' && a && a.pis.length)) && m.back ? m.back : null
  })

export const addTeam = (d: AppState, name: string) => {
  const a = artOf(d.S)
  const id = uid()
  a?.teams.push({ id, name, members: [], velocity: Object.fromEntries(a.platforms.map((p) => [p.name, 30])) })
  return id
}

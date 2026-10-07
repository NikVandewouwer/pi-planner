import { VALS } from '../domain/constants'
import { gridScope } from '../domain/grid'
import { emptyData, defaultUI } from '../domain/migrate'
import { Model } from '../domain/model'
import type { DeleteKind, Modal } from '../domain/types'
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
  if (kind === 'team') {
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
  a?.teams.push({ id, name, members: [], velocity: { Frontend: 30, Backend: 30 } })
  return id
}

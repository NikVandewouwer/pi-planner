import { GF0 } from './constants'
import type { Model } from './model'
import type { GridFilter, ISODate, Member, PI, Team } from './types'
import { piSprints } from './util'

export interface GridScope {
  gf: GridFilter
  sp: ISODate[][]
  /** Sprints shown (all, or the filtered one) */
  gsp: ISODate[][]
  /** Days shown */
  days: ISODate[]
  /** Role names present in the shown teams */
  roles: string[]
  /** Roles offered by the role filter (narrowed by group & platform) */
  groupRoles: string[]
  /** Effective role filter */
  role: string
  passes: (m: Member) => boolean
  filtered: boolean
}

/** Which days and members the availability grid shows, given the filters. */
export function gridScope(model: Model, pi: PI, teams: Team[], gfIn: GridFilter | undefined): GridScope {
  const gf = { ...GF0, ...gfIn }
  const ms = teams.flatMap((t) => t.members)
  const sp = piSprints(pi)
  const roles = model.art.roles.map((r) => r.name).filter((r) => ms.some((m) => m.role === r))
  const groupRoles = roles.filter(
    (r) => (gf.group === 'all' || (gf.group === 'planned') === model.isPlanned(r)) && (gf.platform === 'all' || model.platOf(r) === gf.platform),
  )
  const role = groupRoles.includes(gf.role) ? gf.role : 'all'
  const gsp = gf.sprint !== 'all' && sp[+gf.sprint] ? [sp[+gf.sprint]] : sp
  const days = gsp.flat()
  const passes = (m: Member) =>
    (gf.group === 'all' || (gf.group === 'planned') === model.isPlanned(m.role)) &&
    (gf.platform === 'all' || model.platOf(m.role) === gf.platform) &&
    (role === 'all' || m.role === role) &&
    (!gf.absent || model.sum(m.id, days) < model.work(m.id, days))
  const filtered = gf.group !== 'all' || gf.platform !== 'all' || role !== 'all' || gf.sprint !== 'all' || gf.absent
  return { gf, sp, gsp, days, roles, groupRoles, role, passes, filtered }
}

import type { Art, Data, DeleteKind, PI } from '../domain/types'

const FINAL = "This can't be undone."

/** Title and explanation for a delete/reset confirmation: what else goes, then that it is final. */
/** `shared`: trains are stored in the shared database, so deleting one deletes it for everyone. */
export function askText(S: Data, a: Art, pi: PI | undefined, kind: DeleteKind, id: string, shared = false): [string, string] {
  if (kind === 'platform') {
    const p = a.platforms.find((x) => x.id === id)
    return [`Delete ${p?.name ?? ''}?`, `Features and team velocities lose this platform. ${FINAL}`]
  }
  if (kind === 'team') {
    const t = a.teams.find((x) => x.id === id)
    return [`Delete ${t?.name ?? ''}?`, `Its members, their availability, its days off and its features are deleted too. ${FINAL}`]
  }
  if (kind === 'art') {
    const only = S.arts.length < 2
    const name = (S.arts.find((x) => x.id === id) || a).name
    const again = only ? ' As it is your only train, setup starts again.' : ''
    return [
      `Delete ${name}?`,
      `All its teams, roles, PIs, features and availability are deleted too${shared ? ', for everyone' : ''}.${again} ${FINAL}`,
    ]
  }
  if (kind === 'pi') return [`Delete ${a.pis.find((p) => p.id === id)?.name ?? ''}?`, `Its days off and features are deleted too. ${FINAL}`]
  if (kind === 'feature') return [`Delete ${pi?.features.find((x) => x.id === id)?.name ?? ''}?`, `Its estimated and delivered story points are deleted too. ${FINAL}`]
  if (kind === 'role') return [`Delete ${a.roles.find((x) => x.id === id)?.name ?? ''}?`, `It is no longer offered for members. ${FINAL}`]
  if (kind === 'ftype') return [`Delete ${a.ftypes.find((x) => x.id === id)?.name ?? ''}?`, `It is no longer offered for features. ${FINAL}`]
  if (kind === 'member') {
    const m = a.teams.flatMap((t) => t.members).find((x) => x.id === id)
    return [`Delete ${m?.name ?? ''}?`, `Their availability is deleted too. ${FINAL}`]
  }
  if (kind === 'resetAvail') {
    const tm = a.teams.find((x) => x.id === id)
    return [`Reset ${tm?.name ?? ''}?`, `The days shown in the grid go back to fully available. Days off and filtered-out members stay as they are. ${FINAL}`]
  }
  if (kind === 'off') {
    const o = a.pis.flatMap((p) => p.off).find((x) => x.id === id)
    return [`Delete ${o?.name ?? ''}?`, 'These days count as working days again.']
  }
  return ['Delete?', FINAL]
}

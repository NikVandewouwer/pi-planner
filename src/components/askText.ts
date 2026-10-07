import type { Art, Data, DeleteKind, PI } from '../domain/types'

/** Title and explanation for a delete/reset confirmation. */
export function askText(S: Data, a: Art, pi: PI | undefined, kind: DeleteKind, id: string): [string, string] {
  if (kind === 'team') {
    const t = a.teams.find((x) => x.id === id)
    return [`Delete team ${t?.name ?? ''}?`, `This also deletes its ${t?.members.length ?? 0} members, their availability, its days off and its features in every Program Increment. It can't be undone.`]
  }
  if (kind === 'art') {
    const only = S.arts.length < 2
    return [
      `Delete ${(S.arts.find((x) => x.id === id) || a).name}?`,
      `This deletes the whole Agile Release Train: its roles, teams, members, Program Increments, availability and features.${only ? ' It is your last one, so the app starts fresh from setup.' : ''} It can't be undone.`,
    ]
  }
  if (kind === 'pi') return [`Delete ${a.pis.find((p) => p.id === id)?.name ?? ''}?`, "This also deletes its days off and features, including their delivered story points. It can't be undone."]
  if (kind === 'feature') return [`Delete ${pi?.features.find((x) => x.id === id)?.name ?? ''}?`, "This also deletes its estimated and delivered story points. It can't be undone."]
  if (kind === 'role') return [`Delete role ${a.roles.find((x) => x.id === id)?.name ?? ''}?`, 'It will no longer be offered when you add members.']
  if (kind === 'ftype') return [`Delete type ${a.ftypes.find((x) => x.id === id)?.name ?? ''}?`, 'It will no longer be offered when you add features.']
  if (kind === 'member') {
    const m = a.teams.flatMap((t) => t.members).find((x) => x.id === id)
    return [`Delete ${m?.name ?? ''}?`, 'This also deletes the availability recorded for them.']
  }
  if (kind === 'resetAvail') {
    const tm = a.teams.find((x) => x.id === id)
    return [
      `Reset availability of ${tm?.name ?? ''}?`,
      "This sets every day currently visible in the grid back to fully available (1), for the members shown. Anything hidden by the filters is left as it is. Public holidays and team days off are not affected. It can't be undone.",
    ]
  }
  if (kind === 'off') {
    const o = a.pis.flatMap((p) => p.off).find((x) => x.id === id)
    return [`Delete ${o?.name ?? ''}?`, 'Those days count as working days again.']
  }
  return ['Delete?', '']
}

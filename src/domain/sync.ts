import { migrate } from './migrate'
import type { Art, AvailMap, Data, UI } from './types'

/**
 * A train as stored in the database: the Art plus the availability of its members. The app keeps
 * one availability map for all trains (`Data.avail`); these helpers split it per train and merge
 * it back.
 */
export interface TrainDoc {
  id: string
  name: string
  art: Art
  avail: AvailMap
}

export const memberIds = (a: Art) => a.teams.flatMap((t) => t.members.map((m) => m.id))

export function trainDoc(S: Data, a: Art): TrainDoc {
  const avail: AvailMap = {}
  for (const id of memberIds(a)) if (S.avail[id] && Object.keys(S.avail[id]).length) avail[id] = S.avail[id]
  return { id: a.id, name: a.name, art: a, avail }
}

/** cyrb53: a fast 53-bit string hash, used to tell whether a train changed since it was last synced. */
export function hash(str: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export const docHash = (S: Data, a: Art) => {
  const d = trainDoc(S, a)
  return hash(JSON.stringify([d.art, d.avail]))
}

/** Reads a stored row (untrusted JSON) and upgrades it to the current data shape. */
export function fromRow(row: { id: string; art: unknown; avail: unknown }): TrainDoc | null {
  const art = row.art && typeof row.art === 'object' ? { ...(row.art as object), id: row.id } : null
  if (!art) return null
  const { S } = migrate({ S: { arts: [art], avail: row.avail || {}, done: true } })
  const a = S.arts[0]
  return a ? { id: a.id, name: a.name, art: a, avail: S.avail } : null
}

/** Puts a train into the data, replacing the version that is there and its members' availability. */
export function applyDoc(S: Data, doc: TrainDoc) {
  const i = S.arts.findIndex((a) => a.id === doc.id)
  if (i >= 0) {
    for (const id of memberIds(S.arts[i])) delete S.avail[id]
    S.arts[i] = doc.art
  } else S.arts.push(doc.art)
  for (const id of memberIds(doc.art)) delete S.avail[id]
  Object.assign(S.avail, doc.avail)
}

/** Takes a train and its members' availability out of the data. */
export function removeArt(S: Data, id: string) {
  const a = S.arts.find((x) => x.id === id)
  if (!a) return
  for (const m of memberIds(a)) delete S.avail[m]
  S.arts = S.arts.filter((x) => x !== a)
  if (S.artId === id) {
    S.artId = S.arts[0]?.id ?? null
    S.piId = null
  }
}

/** Trains in `from` that aren't in `S` yet. */
export const newArts = (S: Data, from: Data) => from.arts.filter((a) => !S.arts.some((x) => x.id === a.id))

/** Adds the trains of `from` that aren't in `S` yet, with their availability. Returns how many. */
export function addArts(S: Data, from: Data): number {
  const add = newArts(S, from)
  for (const a of add) applyDoc(S, trainDoc(from, a))
  if (add.length && !S.artId) S.artId = add[0].id
  return add.length
}

/** The train being set up in the wizard. It isn't stored remotely until the wizard finishes. */
export const draftId = (S: Data, ui: UI) => (!S.done || ui.wizard ? S.artId : null)

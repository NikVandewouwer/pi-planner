import { useMemo } from 'react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { STORAGE_KEY } from '../domain/constants'
import { migrate, newArt } from '../domain/migrate'
import { Model } from '../domain/model'
import type { Art, Data, PI, Team, UI } from '../domain/types'

export interface AppState {
  S: Data
  ui: UI
}

interface Store extends AppState {
  /** Mutate state with an immer recipe; invariants are re-applied afterwards. */
  update: (recipe: (d: AppState) => void) => void
  /** Replace everything, e.g. after an import. */
  replace: (next: AppState) => void
}

export const artOf = (S: Data): Art | undefined => S.arts.find((a) => a.id === S.artId)
export const piOf = (S: Data, a: Art | undefined): PI | undefined => a && (a.pis.find((p) => p.id === S.piId) || a.pis[0])
export const scopeTeamsOf = (a: Art, team: string): Team[] => {
  const f = a.teams.filter((t) => t.id === team)
  return f.length ? f : a.teams
}

/** Invariants the original app re-established on every render. */
function normalize(d: AppState) {
  const { S, ui } = d
  if (!S.done && !artOf(S)) {
    const a = newArt()
    S.arts.push(a)
    S.artId = a.id
  }
  const a = artOf(S)
  if (!a) return
  if (!a.pis.find((p) => p.id === S.piId)) S.piId = a.pis[0]?.id ?? null
  if (ui.team !== 'all' && !a.teams.find((x) => x.id === ui.team)) ui.team = 'all'
}

/**
 * Where the data is persisted: STORAGE_KEY when nobody is signed in, or a per-user cache of the
 * trains in their account (see state/cloud.ts).
 */
let storageKey = STORAGE_KEY

function load(key = storageKey): AppState {
  let raw: unknown = null
  try {
    const s = localStorage.getItem(key)
    if (s) raw = JSON.parse(s)
  } catch {
    /* unreadable storage: start fresh */
  }
  const st = migrate(raw)
  normalize(st)
  return st
}

export const useApp = create<Store>()(
  immer((set) => ({
    ...load(),
    update: (recipe) =>
      set((d) => {
        recipe(d)
        normalize(d)
      }),
    replace: (next) =>
      set((d) => {
        d.S = next.S
        d.ui = next.ui
        normalize(d)
      }),
  })),
)

/** Switch to the data persisted under another key, keeping the appearance settings. */
export function switchData(key: string) {
  const { ui } = useApp.getState()
  storageKey = key
  const next = load(key)
  next.ui.theme = ui.theme
  next.ui.palette = ui.palette
  useApp.getState().replace(next)
}

export const update = (recipe: (d: AppState) => void) => useApp.getState().update(recipe)

export function persistedJSON({ S, ui }: AppState) {
  return JSON.stringify({ S, ui: { ...ui, modal: null, menu: false } })
}

useApp.subscribe((st, prev) => {
  if (st.S === prev.S && st.ui === prev.ui) return
  try {
    localStorage.setItem(storageKey, persistedJSON(st))
  } catch {
    /* storage full or blocked */
  }
})

/* ---------- hooks ---------- */

export const useUI = () => useApp((s) => s.ui)
export const useData = () => useApp((s) => s.S)

/** Current Agile Release Train. Only call where one is guaranteed to exist. */
export const useArt = (): Art => useApp((s) => artOf(s.S)) as Art
export const useCurPI = () => useApp((s) => piOf(s.S, artOf(s.S)))

export function useModel(): Model {
  const art = useArt()
  const avail = useApp((s) => s.S.avail)
  return useMemo(() => new Model(art, avail), [art, avail])
}

export function useScopeTeams(): Team[] {
  const art = useArt()
  const team = useApp((s) => s.ui.team)
  return useMemo(() => scopeTeamsOf(art, team), [art, team])
}

import type { RealtimeChannel } from '@supabase/supabase-js'
import { create } from 'zustand'
import { STORAGE_KEY } from '../domain/constants'
import { addArts, applyDoc, docHash, draftId, fromRow, removeArt, trainDoc, type TrainDoc } from '../domain/sync'
import type { Data } from '../domain/types'
import { uid } from '../domain/util'
import { switchData, update, useApp } from './store'
import { supabase } from './supabase'

/*
 * Sync with Supabase. There is no sign-in: everyone who opens the app shares the same trains.
 *
 * The store stays the single source of truth for the UI. Every train is one row in `trains`
 * (see supabase/migrations). Local changes are pushed per train after a short pause, with the
 * row version they were based on; if someone else saved in between, their version wins and is
 * shown. Remote changes arrive through realtime and when the window regains focus.
 *
 * `base` remembers, per train, the row version last seen and a hash of its content at that
 * point, so a train is dirty when its hash differs. It is persisted next to the cached data, so
 * edits made just before a reload or while offline are still pushed.
 */

type Status = 'local' | 'loading' | 'saving' | 'saved' | 'offline' | 'error'

interface CloudState {
  /** A Supabase project is configured in this build. */
  enabled: boolean
  status: Status
  /** A message about a change made elsewhere, shown until dismissed. */
  notice: string | null
}

export const useCloud = create<CloudState>(() => ({ enabled: !!supabase, status: supabase ? 'loading' : 'local', notice: null }))
const setCloud = (p: Partial<CloudState>) => useCloud.setState(p)

/** Local cache of the shared trains, kept apart from the browser-only data under STORAGE_KEY. */
const CACHE_KEY = `${STORAGE_KEY}:shared`
const BASE_KEY = `${CACHE_KEY}:base`

type Base = Map<string, { v: number; h: string }>
let base: Base = new Map()
/** Pushing starts once the shared trains were loaded. */
let live = false

function saveBase() {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify([...base]))
  } catch {
    /* storage full or blocked */
  }
}

function loadBase(): Base {
  try {
    return new Map(JSON.parse(localStorage.getItem(BASE_KEY) || '[]'))
  } catch {
    return new Map()
  }
}

/** Runs sync steps one after another, so a pull never interleaves with a push. */
let chain: Promise<void> = Promise.resolve()
const serial = (step: () => Promise<void>) => {
  chain = chain.then(step).catch((e) => {
    console.warn('Sync failed', e)
    setCloud({ status: navigator.onLine ? 'error' : 'offline' })
    retry()
  })
  return chain
}

let retryTimer = 0
function retry() {
  clearTimeout(retryTimer)
  retryTimer = window.setTimeout(() => { schedulePull(); schedulePush(0) }, 10_000)
}

let pushTimer = 0
function schedulePush(delay = 800) {
  if (!live) return
  clearTimeout(pushTimer)
  pushTimer = window.setTimeout(() => serial(push), delay)
}

let pullTimer = 0
function schedulePull() {
  clearTimeout(pullTimer)
  pullTimer = window.setTimeout(() => serial(pull), 300)
}

/** Applies remote rows to the store and records them as the new base. */
function applyRows(rows: { id: string; art: unknown; avail: unknown; version: number }[]) {
  const docs = rows.map((r) => [r, fromRow(r)] as const).filter((x): x is [typeof x[0], TrainDoc] => !!x[1])
  if (!docs.length) return
  update(({ S }) => { for (const [, d] of docs) applyDoc(S, d) })
  const { S } = useApp.getState()
  for (const [r] of docs) {
    const a = S.arts.find((x) => x.id === r.id)
    if (a) base.set(r.id, { v: r.version, h: docHash(S, a) })
  }
}

function dropLocal(id: string) {
  update(({ S }) => removeArt(S, id))
  base.delete(id)
}

/* ---------- pull: bring the store up to date with the database ---------- */

async function pull() {
  if (!supabase) return
  const heads = await supabase.from('trains').select('id, name, version')
  if (heads.error) throw heads.error

  const { S, ui } = useApp.getState()
  const draft = draftId(S, ui)
  const changed: string[] = []
  const lost: string[] = []
  for (const h of heads.data) {
    const b = base.get(h.id)
    if (b && b.v >= h.version) continue
    const a = S.arts.find((x) => x.id === h.id)
    if (b && a && docHash(S, a) !== b.h) lost.push(h.name || 'A train')
    changed.push(h.id)
  }
  if (changed.length) {
    const rows = await supabase.from('trains').select('id, art, avail, version').in('id', changed)
    if (rows.error) throw rows.error
    applyRows(rows.data)
  }

  // trains that were synced before but are gone now: deleted elsewhere
  const remote = new Set(heads.data.map((h) => h.id))
  for (const id of [...base.keys()]) if (!remote.has(id)) dropLocal(id)

  // first load in this browser: replace the empty setup with the shared trains
  update(({ S }) => {
    if (!S.done && heads.data.length) {
      if (draft) removeArt(S, draft)
      S.done = true
    }
    if (!S.arts.some((a) => a.id === S.artId)) S.artId = S.arts[0]?.id ?? null
  })
  saveBase()
  if (lost.length) setCloud({ notice: `${lost.join(', ')} changed elsewhere while you were editing. The latest saved version is shown.` })
}

/* ---------- push: send local changes ---------- */

async function push() {
  if (!supabase || !live) return
  const { S, ui } = useApp.getState()
  const draft = draftId(S, ui)
  const ids = new Set<string>()
  const saving = () => { if (useCloud.getState().status !== 'saving') setCloud({ status: 'saving' }) }

  for (const a of S.arts) {
    if (a.id === draft) continue
    ids.add(a.id)
    const h = docHash(S, a)
    const b = base.get(a.id)
    if (b?.h === h) continue
    saving()
    const { avail } = trainDoc(S, a)
    if (!b) {
      const r = await supabase.from('trains').insert({ id: a.id, name: a.name, art: a, avail })
      if (r.error?.code === '23505') {
        // the id is taken: by this train saved from another browser, or by another copy of the same export
        const same = await supabase.from('trains').select('id').eq('id', a.id).maybeSingle()
        if (same.data) await conflict(a.id, a.name)
        else rekey(a.id)
        continue
      }
      if (r.error) throw r.error
      base.set(a.id, { v: 1, h })
    } else {
      const r = await supabase.from('trains').update({ name: a.name, art: a, avail, version: b.v + 1 }).eq('id', a.id).eq('version', b.v).select('version')
      if (r.error) throw r.error
      if (!r.data.length) { await conflict(a.id, a.name); continue }
      base.set(a.id, { v: b.v + 1, h })
    }
  }

  for (const id of [...base.keys()]) {
    if (ids.has(id) || id === draft) continue
    saving()
    const r = await supabase.from('trains').delete().eq('id', id)
    if (r.error) throw r.error
    base.delete(id)
  }
  saveBase()
  setCloud({ status: 'saved' })
}

/** Gives a train that was never stored a new id, and pushes it again. */
function rekey(id: string) {
  const next = uid()
  update(({ S }) => {
    const a = S.arts.find((x) => x.id === id)
    if (a) a.id = next
    if (S.artId === id) S.artId = next
  })
}

/** Someone else saved first: show their version. */
async function conflict(id: string, name: string) {
  const r = await supabase!.from('trains').select('id, art, avail, version').eq('id', id).maybeSingle()
  if (r.error) throw r.error
  if (r.data) {
    applyRows([r.data])
    setCloud({ notice: `${name || 'A train'} was changed elsewhere at the same time. The latest saved version is shown.` })
  } else {
    dropLocal(id)
    setCloud({ notice: `${name || 'A train'} was deleted elsewhere.` })
  }
}

/** Adds the trains of an imported file next to the shared ones. */
export function addTrains(from: Data) {
  update(({ S, ui }) => {
    const draft = draftId(S, ui)
    if (!S.done && draft && addArts(S, from)) { removeArt(S, draft); S.done = true }
    else addArts(S, from)
    if (!S.arts.some((a) => a.id === S.artId)) S.artId = S.arts[0]?.id ?? null
    ui.modal = null
  })
}

export const dismissNotice = () => setCloud({ notice: null })

/* ---------- start ---------- */

let channel: RealtimeChannel | null = null

export async function startCloud() {
  if (!supabase || channel) return
  switchData(CACHE_KEY)
  base = loadBase()
  useApp.subscribe((st, prev) => { if (st.S !== prev.S || st.ui.wizard !== prev.ui.wizard) schedulePush() })
  window.addEventListener('focus', () => { if (live) schedulePull() })
  window.addEventListener('online', () => schedulePush(0))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && live) { clearTimeout(pushTimer); serial(push) } })

  channel = supabase
    .channel('trains')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trains' }, (p) => {
      const row = p.new as { id?: string; version?: number }
      const b = row.id ? base.get(row.id) : undefined
      if (b && row.version != null && b.v >= row.version) return // our own save
      schedulePull()
    })
    .subscribe()

  await serial(pull)
  live = true
  if (useCloud.getState().status === 'loading') setCloud({ status: 'saved' })
  schedulePush(0)
}

/** Status line for the menu. */
export const STATUS: Record<Status, string> = {
  local: 'Data is stored in this browser only. Export it to keep a backup or move it to another browser.',
  loading: 'Loading…',
  saving: 'Saving…',
  saved: 'Trains are shared with everyone who opens this app. All changes saved.',
  offline: 'Offline. Changes are saved when you’re back online.',
  error: 'Can’t save right now. Trying again.',
}

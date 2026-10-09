import { useRef } from 'react'
import { PALETTES } from '../domain/constants'
import { migrate, newArt } from '../domain/migrate'
import { newArts } from '../domain/sync'
import type { Modal, PI } from '../domain/types'
import { fmt, piEnd, sd } from '../domain/util'
import { ask, closeModal, confirmAsk, focusArt, openModal } from '../state/actions'
import { addTrains, useCloud } from '../state/cloud'
import { artOf, persistedJSON, piOf, update, useApp, useArt, useCurPI, useData, useUI } from '../state/store'
import { askText } from './askText'
import { MemberStats, RoleStats } from './Availability'
import { SyncStatus } from './Sync'
import { BrandMark, ChevronIcon, MenuIcon, PenIcon, ThemeIcon, TrashIcon, XIcon } from './common'
import { FeatureForm } from './FeatureForm'
import { CloseX, DoneRow, ModalShell } from './ModalShell'
import { PlatformsView } from './Platforms'
import { MemberForm, NewTeamForm, PIForm, RoleEditForm, RolesView, TeamEditor, TeamsView, TypesView } from './settings'

/* ---------- app bar ---------- */

export function AppBar() {
  const S = useData()
  const ui = useUI()
  const a = useApp((s) => artOf(s.S))
  const pi = useApp((s) => piOf(s.S, artOf(s.S)))
  if (!S.done || ui.wizard || !a) {
    return <span className="brand"><BrandMark /><span>PI&nbsp;Planner</span></span>
  }
  const pis = [...a.pis].sort((p, q) => p.start.localeCompare(q.start))
  const at = pi ? pis.indexOf(pi) : -1
  return (
    <>
      <button className="icon" onClick={() => update(({ ui }) => { ui.menu = !ui.menu })} title="Menu" aria-label="Open menu" aria-expanded={ui.menu}>
        <MenuIcon />
      </button>
      <span className="brand"><BrandMark /><span>PI&nbsp;Planner<small className="bart" title={a.name}>{a.name}</small></span></span>
      <span className="hsep" />
      <span className="hctx">
        <span className="artm">{a.name}</span>
        {pi ? (
          <span className="pinav">
            {pis.length > 1 && <PIStep to={pis[at - 1]} dir="left" />}
            <span className="hpi" title={`${fmt(pi.start)} – ${fmt(piEnd(pi))} · ${pi.sprints} sprints`}><b>{pi.name}</b><small>{sd(pi.start)}–{sd(piEnd(pi))}</small></span>
            {pis.length > 1 && <PIStep to={pis[at + 1]} dir="right" />}
          </span>
        ) : (
          <span className="hpi mute"><b>No PI yet</b></span>
        )}
      </span>
      <span className="sp" />
      <span className="ctxrow">
        {pi && (
          <label className="pill team">
            <span>Team</span>
            <select value={ui.team} onChange={(e) => { const v = e.target.value; update(({ ui }) => { ui.team = v }) }} aria-label="Team">
              <option value="all">All teams</option>
              {a.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}
      </span>
    </>
  )
}

/** Steps to the previous or next PI of the train; disabled at either end. */
function PIStep({ to, dir }: { to: PI | undefined; dir: 'left' | 'right' }) {
  const label = dir === 'left' ? 'Previous' : 'Next'
  return (
    <button
      className="icon pistep"
      disabled={!to}
      onClick={() => to && update(({ S }) => { S.piId = to.id })}
      title={to ? `${label}: ${to.name}` : label}
      aria-label={to ? `${label} PI, ${to.name}` : `${label} PI`}
    >
      <ChevronIcon dir={dir} />
    </button>
  )
}

/* ---------- side menu ---------- */

function downloadJSON() {
  const st = useApp.getState()
  const blob = new Blob([persistedJSON(st)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `pi-planner-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Nav() {
  const S = useData()
  const ui = useUI()
  const fileRef = useRef<HTMLInputElement>(null)
  const shared = useCloud((s) => s.enabled)
  if (!ui.menu) return null
  const th = ui.theme || 'system'
  const pal = ui.palette || 'forest'
  const cur = piOf(S, artOf(S))
  const close = () => update(({ ui }) => { ui.menu = false })

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const payload = JSON.parse(await file.text())
      const m = migrate(payload)
      if (!m.S.arts.length) throw new Error('empty')
      openModal({ type: 'import', payload, arts: m.S.arts.length })
    } catch {
      openModal({ type: 'import', payload: null, arts: 0 })
    }
  }

  return (
    <>
      <div className="mscrim" onClick={close} />
      <nav className="nav" aria-label="Main menu">
        <div className="nhd">
          <div className="nbrand">
            <BrandMark className="mark" id="lg" />
            <div><h2>PI Planner</h2><p>Plan PIs on real availability</p></div>
          </div>
          <button className="icon" onClick={close} title="Close" aria-label="Close menu" style={{ position: 'absolute', top: 12, right: 12 }}><XIcon /></button>
        </div>
        <div className="nbody">
          <div className="nsec">Trains</div>
          {S.arts.map((x) => {
            const isCur = x.id === S.artId
            const pis = [...x.pis].sort((p, q) => p.start.localeCompare(q.start))
            return (
              <div key={x.id} className={`ngrp${isCur ? ' cur' : ''}`}>
                <div className="nart">
                  <span className="nm" title={x.name || 'Unnamed train'}>{x.name || 'Unnamed train'}</span>
                  <button className="ghost icon" onClick={() => update((d) => { if (d.S.artId !== x.id) { d.S.artId = x.id; d.S.piId = null; d.ui.team = 'all' } d.ui.view = 'setup'; d.ui.menu = false })} title="Edit" aria-label={`Edit ${x.name}`}><PenIcon /></button>
                  <button className="ghost icon danger" onClick={() => ask('art', x.id)} title="Delete" aria-label={`Delete ${x.name}`}><TrashIcon /></button>
                </div>
                <div className="npis">
                  {pis.length ? pis.map((p: PI) => (
                    <div key={p.id} className={`npi${isCur && cur && p.id === cur.id ? ' on' : ''}`}>
                      <span
                        className="nm"
                        role="button"
                        tabIndex={0}
                        style={{ cursor: 'pointer' }}
                        onClick={() => update((d) => { focusArt(d, x.id, p.id); d.S.piId = p.id; d.ui.modal = null; d.ui.menu = false })}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click() } }}
                      >
                        <b>{p.name}</b><small>{fmt(p.start)} – {fmt(piEnd(p))} · {p.sprints} sprints</small>
                      </span>
                      <button className="ghost icon" onClick={() => update((d) => { focusArt(d, x.id, p.id); d.ui.modal = { type: 'pi', id: p.id }; d.ui.piTab = 'details' })} title="Edit" aria-label={`Edit ${p.name}`}><PenIcon /></button>
                      <button className="ghost icon danger" onClick={() => update((d) => { focusArt(d, x.id, p.id); d.ui.modal = { type: 'ask', kind: 'pi', id: p.id, back: null } })} title="Delete" aria-label={`Delete ${p.name}`}><TrashIcon /></button>
                    </div>
                  )) : <p className="nempty">No PIs yet.</p>}
                  <button className="nadd" onClick={() => update((d) => { focusArt(d, x.id, null); d.ui.modal = { type: 'pi', id: 'new' } })}>+ Add</button>
                </div>
              </div>
            )
          })}
          <button
            className="nadd art"
            onClick={() => update(({ S, ui }) => {
              const a = newArt()
              ui.menu = false
              ui.prevArt = S.artId
              S.arts.push(a)
              S.artId = a.id
              S.piId = null
              ui.step = 1
              ui.wizard = true
            })}
          >
            + Add
          </button>
        </div>
        <div className="nftr">
          <div className="nsec">Appearance</div>
          <div className="pal" role="radiogroup" aria-label="Colour palette">
            {PALETTES.map(([k, l, c]) => (
              <button key={k} role="radio" aria-checked={pal === k} className={pal === k ? 'on' : ''} onClick={() => update(({ ui }) => { ui.palette = k })} title={l} aria-label={l} style={{ '--sw': c } as React.CSSProperties} />
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="thsw" role="radiogroup" aria-label="Theme">
              {(['system', 'light', 'dark'] as const).map((k) => (
                <button key={k} role="radio" aria-checked={th === k} className={th === k ? 'on' : ''} onClick={() => update(({ ui }) => { ui.theme = k })} title={k[0].toUpperCase() + k.slice(1)} aria-label={`${k} theme`}>
                  <ThemeIcon kind={k} />
                </button>
              ))}
            </div>
          </div>
          <div className="nsec" style={{ marginTop: 14 }}>Data</div>
          <div className="row" style={{ margin: '6px 0 0' }}>
            <button onClick={downloadJSON} title="Download all data as a file">Export</button>
            <button onClick={() => fileRef.current?.click()} title={shared ? 'Add the trains in an exported file' : 'Replace all data with an exported file'}>Import</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <SyncStatus />
        </div>
      </nav>
    </>
  )
}

/* ---------- ART settings ---------- */

export function SetupModal() {
  const a = useArt()
  const ui = useUI()
  const close = () => update(({ ui }) => { ui.view = 'plan' })
  const tabs = [['general', 'General'], ['platforms', 'Platforms'], ['roles', 'Roles'], ['teams', 'Teams'], ['ftypes', 'Feature types']] as const
  const body =
    ui.setupTab === 'platforms' ? <PlatformsView />
    : ui.setupTab === 'teams' ? <TeamsView />
    : ui.setupTab === 'roles' ? <RolesView />
    : ui.setupTab === 'ftypes' ? <TypesView />
    : (
      <>
        <p className="help">The name of this train.</p>
        <div className="panel">
          <div className="fsec" style={{ marginBottom: 12 }}>General</div>
          <label className="f">Name
            <input value={a.name} onChange={(e) => { const v = e.target.value; update(({ S }) => { const x = artOf(S); if (x) x.name = v }) }} />
          </label>
        </div>
        <div className="panel">
          <div className="secrow">
            <div>
              <h3>Delete train</h3>
              <span className="mute" style={{ fontSize: '.85rem' }}>Removes its teams, roles, PIs and availability.</span>
            </div>
            <button className="danger acts-b" onClick={() => ask('art', a.id)}><TrashIcon />Delete</button>
          </div>
        </div>
      </>
    )
  return (
    <ModalShell wide onClose={close} label="Edit train">
      <div className="head" style={{ marginBottom: 14 }}>
        <h2>Edit train <span className="mute" style={{ fontWeight: 600 }}>{a.name}</span></h2>
        <button className="icon" onClick={close} title="Close" aria-label="Close"><XIcon size={18} /></button>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} className={ui.setupTab === k ? 'on' : ''} onClick={() => update(({ ui }) => { ui.setupTab = k })}>{l}</button>)}
      </div>
      <div style={{ marginTop: 14 }}>{body}</div>
      <DoneRow onClose={close} />
    </ModalShell>
  )
}

/* ---------- modal router ---------- */

const NO_DONE_ROW: Modal['type'][] = ['role', 'member', 'member-edit', 'role-edit', 'feature', 'pi', 'ask', 'import']

export function ModalView() {
  const ui = useUI()
  const S = useData()
  const a = useApp((s) => artOf(s.S))
  const pi = useCurPI()
  const cloud = useCloud()
  const m = ui.modal
  if (!m || !a) return null

  let inner: React.ReactNode = null
  if (m.type === 'art') {
    inner = (
      <>
        <h2>Rename train</h2>
        <div className="row"><input value={a.name} aria-label="Train name" autoFocus onChange={(e) => { const v = e.target.value; update(({ S }) => { const x = artOf(S); if (x) x.name = v }) }} /></div>
      </>
    )
  } else if (m.type === 'pi') inner = <PIForm key={m.id} id={m.id} tab={ui.piTab || 'details'} />
  else if (m.type === 'ask') {
    const [h, txt] = askText(S, a, pi, m.kind, m.id, cloud.enabled)
    inner = (
      <>
        <h2>{h}</h2>
        <p className="mute">{txt}</p>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={() => update(({ ui }) => { ui.modal = m.back })} autoFocus>Cancel</button>
          <button className="primary" onClick={confirmAsk} style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}>{m.kind === 'resetAvail' ? 'Reset' : 'Delete'}</button>
        </div>
      </>
    )
  } else if (m.type === 'import' && cloud.enabled && m.payload) {
    const from = migrate(m.payload).S
    const n = newArts(S, from).length
    inner = n ? (
      <>
        <h2>Import trains?</h2>
        <p className="mute">The {n} {n === 1 ? 'train' : 'trains'} in the file {n === 1 ? 'is' : 'are'} added next to the trains already there.</p>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={closeModal} autoFocus>Cancel</button>
          <button className="primary" onClick={() => addTrains(from)}>Import</button>
        </div>
      </>
    ) : (
      <>
        <h2>Nothing to import</h2>
        <p className="mute">The trains in this file are already here.</p>
        <DoneRow onClose={closeModal} />
      </>
    )
  } else if (m.type === 'import') {
    inner = m.payload ? (
      <>
        <h2>Replace all data?</h2>
        <p className="mute">Everything in this browser is replaced by the {m.arts} {m.arts === 1 ? 'train' : 'trains'} in the file. This can't be undone.</p>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={closeModal} autoFocus>Cancel</button>
          <button className="primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }} onClick={() => {
            const next = migrate(m.payload)
            next.S.done = true
            next.ui.theme = ui.theme
            next.ui.palette = ui.palette
            useApp.getState().replace(next)
          }}>Replace</button>
        </div>
      </>
    ) : (
      <>
        <h2>Can't import file</h2>
        <p className="mute">This isn't a PI Planner export, or it has no trains.</p>
        <DoneRow onClose={closeModal} />
      </>
    )
  } else if (m.type === 'feature') inner = pi ? <FeatureForm key={m.id} id={m.id} /> : null
  else if (m.type === 'role') inner = pi ? <><CloseX onClose={closeModal} /><RoleStats role={m.id} pi={pi} /></> : null
  else if (m.type === 'member') inner = pi ? <><CloseX onClose={closeModal} /><MemberStats id={m.id} pi={pi} /></> : null
  else if (m.type === 'member-edit') inner = <MemberForm key={m.id} id={m.id} />
  else if (m.type === 'role-edit') inner = <RoleEditForm key={m.id} id={m.id} />
  else if (m.type === 'newTeam') inner = <NewTeamForm />
  else if (m.type === 'team') {
    const t = a.teams.find((x) => x.id === m.id)
    if (!t) return null
    inner = <><h2 style={{ marginBottom: 14 }}>Edit team</h2><TeamEditor t={t} flat /></>
  }
  if (!inner) return null
  const wide = m.type === 'role' || m.type === 'member' || (m.type === 'pi' && m.id !== 'new')
  return (
    <ModalShell wide={wide} onClose={closeModal}>
      {inner}
      {!NO_DONE_ROW.includes(m.type) && <DoneRow onClose={closeModal} />}
    </ModalShell>
  )
}

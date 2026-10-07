import { useRef, useState, type CSSProperties, type FormEvent, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { PLATFORMS, ROLE_SUGGEST } from '../domain/constants'
import { nextTypeColor } from '../domain/migrate'
import { tvel } from '../domain/model'
import type { Member, PI, Platform, Role, Team } from '../domain/types'
import { fmt, nextPIStart, num, piEnd, toMonday, uid } from '../domain/util'
import { addTeam, ask, closeModal, openModal } from '../state/actions'
import { artOf, update, useArt, useModel } from '../state/store'
import { Info, Mav, PenIcon, TrashIcon, XIcon } from './common'
import { clickable } from './clickable'
import { Err } from './ModalShell'

/* ---------- small inputs ---------- */

/** Uncontrolled input that commits on blur or Enter. Return false from onCommit to revert. */
export function CommitInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => boolean | void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue'>) {
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => {
        if (e.currentTarget.value === value) return
        if (onCommit(e.currentTarget.value) === false) e.currentTarget.value = value
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      {...rest}
    />
  )
}

/** On/off switch with the original look. */
export function Switch({ checked, onChange, label, name, style, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label: string; name?: string; style?: CSSProperties; ariaLabel?: string }) {
  return (
    <label className="fsw" style={style}>
      <span className="sw">
        <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={ariaLabel} />
        <span className="knob" />
      </span>
      {label}
    </label>
  )
}

/* ---------- team ---------- */

export function TeamEditor({ t, withMembers, flat }: { t: Team; withMembers?: boolean; flat?: boolean }) {
  const model = useModel()
  const inner = (
    <>
      <div className="fsec">Details</div>
      <label className="f">
        Team name
        <CommitInput
          aria-label="Team name"
          value={t.name}
          onCommit={(v) => {
            if (!v.trim()) return false
            update(({ S }) => { const x = artOf(S)?.teams.find((x) => x.id === t.id); if (x) x.name = v.trim() })
          }}
        />
      </label>
      <div className="fsec" style={{ marginTop: 10 }}>
        Velocity <Info size={16} text="Story points this team delivers per 100 days of its planning roles. It is only used to forecast until the team has delivered story points in an earlier Program Increment; after that the real average takes over." />
      </div>
      <div className="ff2">
        {PLATFORMS.map((pl) => (
          <label className="f" key={pl}>
            {pl}
            <CommitInput
              inputMode="decimal"
              value={String(tvel(t, pl))}
              onCommit={(v) => {
                const n = num(v)
                update(({ S }) => { const x = artOf(S)?.teams.find((x) => x.id === t.id); if (x) x.velocity[pl] = n == null || n < 0 ? 30 : n })
              }}
            />
          </label>
        ))}
      </div>
      {withMembers && (
        <>
          <div className="fsec" style={{ marginTop: 10 }}>Members</div>
          <div className="mcards">
            {model.sortedMembers(t.members).map((m) => <MemberCard key={m.id} m={m} />)}
            <button className="mcard add" onClick={() => openModal({ type: 'member-edit', id: 'new:' + t.id })}>+ Add member</button>
          </div>
        </>
      )}
    </>
  )
  return flat ? <div className="ff">{inner}</div> : <div className="panel">{inner}</div>
}

export function MemberCard({ m }: { m: Member }) {
  const model = useModel()
  const inp = model.isPlanned(m.role)
  return (
    <div className={`mcard ${inp ? 'in' : 'out'} clickable`} {...clickable(() => openModal({ type: 'member-edit', id: m.id }))} title={`Edit ${m.name} · ${m.role}`}>
      <button className="xcorner" onClick={(e) => { e.stopPropagation(); ask('member', m.id) }} title="Delete member" aria-label={`Delete ${m.name}`}>
        <XIcon />
      </button>
      <div className="mtop">
        <Mav name={m.name} />
        <div className="nmt"><b>{m.name}</b><small>{m.role}</small></div>
      </div>
    </div>
  )
}

export function TeamsView() {
  const a = useArt()
  const model = useModel()
  const ms = model.allMembers()
  return (
    <>
      <div className="row">
        <span className="grow mute">{a.teams.length} {a.teams.length === 1 ? 'team' : 'teams'}, {ms.length} {ms.length === 1 ? 'member' : 'members'}</span>
        <button className="primary" onClick={() => openModal({ type: 'newTeam' })}>Add team</button>
      </div>
      {a.teams.length ? a.teams.map((t) => (
        <section className="tsec" key={t.id}>
          <div className="secrow">
            <div>
              <h3>{t.name} <span className="mute" style={{ fontWeight: 600 }}>({t.members.length})</span></h3>
              <div className="vchips">
                <span className="mute" style={{ fontSize: '.78rem', alignSelf: 'center' }}>Velocity</span>
                {PLATFORMS.map((pl) => <span className="vchip" key={pl}>{pl} <b>{+tvel(t, pl).toFixed(2)} SP</b></span>)}
              </div>
            </div>
            <div className="acts">
              <button onClick={() => openModal({ type: 'team', id: t.id })}><PenIcon />Edit</button>
              <button className="ghost danger" onClick={() => ask('team', t.id)}><TrashIcon />Delete</button>
            </div>
          </div>
          <div className="mcards">
            {model.sortedMembers(t.members).map((m) => <MemberCard key={m.id} m={m} />)}
            <button className="mcard add" onClick={() => openModal({ type: 'member-edit', id: 'new:' + t.id })}>+ Add member</button>
          </div>
        </section>
      )) : <div className="empty">No teams yet.</div>}
    </>
  )
}

export function NewTeamForm() {
  const [err, setErr] = useState<string | null>(null)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const name = (e.currentTarget.elements.namedItem('name') as HTMLInputElement).value.trim()
    if (!name) return setErr('Please enter a name.')
    update((d) => { const id = addTeam(d, name); d.ui.modal = { type: 'team', id } })
  }
  return (
    <>
      <h2>Add team</h2>
      <form className="row" onSubmit={submit}>
        <input name="name" placeholder="Team name" autoFocus className={err ? 'invalid' : ''} onInput={() => setErr(null)} />
        <Err msg={err} />
        <button className="primary">Create team</button>
      </form>
    </>
  )
}

export function MemberForm({ id }: { id: string }) {
  const a = useArt()
  const model = useModel()
  const [err, setErr] = useState<string | null>(null)
  let m: Member | null = null
  let tm: Team | undefined
  if (id.startsWith('new:')) {
    const t = a.teams.find((x) => x.id === id.slice(4))
    return t ? <MemberAddForm team={t} /> : null
  }
  const f = model.findMember(id)
  if (f) { m = f.m; tm = f.tm }
  if (!tm) return null
  const team = tm
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const el = e.currentTarget.elements
    const name = (el.namedItem('name') as HTMLInputElement).value.trim()
    const role = (el.namedItem('role') as HTMLSelectElement).value
    if (!name) return setErr('Please enter a name.')
    update(({ S, ui }) => {
      const t = artOf(S)?.teams.find((x) => x.id === team.id)
      if (t) {
        const ex = m && t.members.find((x) => x.id === m!.id)
        if (ex) { ex.name = name; ex.role = role } else if (!m) t.members.push({ id: uid(), name, role })
      }
      ui.modal = null
    })
  }
  return (
    <>
      <h2 style={{ marginBottom: 14 }}>{m ? 'Edit member' : 'Add member'} <span className="mute" style={{ fontWeight: 600 }}>{team.name}</span></h2>
      <form className="ff" onSubmit={submit}>
        <label className="f">Name<input name="name" defaultValue={m?.name ?? ''} autoFocus className={err ? 'invalid' : ''} onInput={() => setErr(null)} /><Err msg={err} /></label>
        <label className="f">Role
          <select name="role" defaultValue={m?.role ?? a.roles[0]?.name ?? ''}>
            {a.roles.map((r) => <option key={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          {m ? <button type="button" className="ghost danger" onClick={() => ask('member', m!.id)}>Delete</button> : <span />}
          <div className="row" style={{ margin: 0 }}>
            <button type="button" onClick={closeModal}>Cancel</button>
            <button className="primary">{m ? 'Save' : 'Add member'}</button>
          </div>
        </div>
      </form>
    </>
  )
}

/** Add several members with the same role at once: each name becomes a chip (Tab, Enter or comma). */
function MemberAddForm({ team }: { team: Team }) {
  const a = useArt()
  const [draft, setDraft] = useState<{ id: string; name: string }[]>([])
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const inRef = useRef<HTMLInputElement>(null)

  const key = (s: string) => s.trim().toLowerCase()
  /** Turns raw text into a chip. Returns the new draft, or null when the name is already taken. */
  const commitText = (raw: string, d = draft): typeof draft | null => {
    const t = raw.trim().replace(/\s+/g, ' ')
    if (!t) return d
    if (d.some((x) => key(x.name) === key(t))) { setErr(`“${t}” is already in the list.`); return null }
    if (team.members.some((x) => key(x.name) === key(t))) { setErr(`“${t}” is already in ${team.name}.`); return null }
    return [...d, { id: uid(), name: t }]
  }
  const commit = () => {
    const n = commitText(text)
    if (n) { setDraft(n); setText('') }
  }

  const onChange = (v: string) => {
    setErr(null)
    if (v.includes(',')) {
      const parts = v.split(',')
      const rest = parts.pop() ?? ''
      let d = draft
      for (const p of parts) { const n = commitText(p, d); if (n) d = n }
      setDraft(d)
      v = rest
    }
    setText(v)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
      // with an empty field, Tab moves on and Enter submits
      if (!text.trim()) return
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !text && draft.length) {
      setDraft(draft.slice(0, -1))
    }
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const d = commitText(text)
    if (!d) return
    if (!d.length) { setErr('Add at least one name.'); inRef.current?.focus(); return }
    const role = (e.currentTarget.elements.namedItem('role') as HTMLSelectElement).value
    update(({ S, ui }) => {
      const t = artOf(S)?.teams.find((x) => x.id === team.id)
      d.forEach((x) => t?.members.push({ id: uid(), name: x.name, role }))
      ui.modal = null
    })
  }
  const label = draft.length > 1 ? `Add ${draft.length} members` : 'Add member'

  return (
    <>
      <h2 style={{ marginBottom: 14 }}>Add members <span className="mute" style={{ fontWeight: 600 }}>{team.name}</span></h2>
      <form className="ff" autoComplete="off" onSubmit={submit}>
        <div className="ra-wrap">
          <div className="ra-lab">Names</div>
          <div className={`ra-field${err ? ' invalid' : ''}`} onClick={() => inRef.current?.focus()}>
            {draft.map((d) => (
              <span className="ra-badge" key={d.id}>
                <span title={d.name}>{d.name}</span>
                <button type="button" className="ra-x" tabIndex={-1} aria-label={`Remove ${d.name}`} onClick={(e) => { e.stopPropagation(); setDraft(draft.filter((x) => x.id !== d.id)); inRef.current?.focus() }}>
                  <XIcon />
                </button>
              </span>
            ))}
            <input
              ref={inRef}
              className="ra-in"
              autoFocus
              autoComplete="off"
              autoCapitalize="words"
              aria-label="Member name"
              placeholder={draft.length ? 'Add another name' : 'e.g. Ada Lovelace'}
              value={text}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <div><Err msg={err} /></div>
          <p className="mute" style={{ margin: '6px 0 0', fontSize: '.8rem' }}>Type a name and press Tab or Enter. Each one becomes a chip, so you can add several people before saving.</p>
        </div>
        <label className="f">Role
          <select name="role" defaultValue={a.roles[0]?.name ?? ''}>
            {a.roles.map((r) => <option key={r.id}>{r.name}</option>)}
          </select>
        </label>
        <p className="mute" style={{ margin: '-4px 0 0', fontSize: '.8rem' }}>Applies to everyone you add here.</p>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" onClick={closeModal}>Cancel</button>
          <button className="primary">{label}</button>
        </div>
      </form>
    </>
  )
}

/* ---------- roles ---------- */

function RoleCard({ r, plain }: { r: Role; plain?: boolean }) {
  const model = useModel()
  const warn = r.planned && !r.platform
  const used = model.usedRole(r.name)
  return (
    <div
      className={`mcard ${r.planned ? 'in' : 'out'}${plain ? '' : ' clickable'}`}
      {...(plain ? {} : clickable(() => openModal({ type: 'role-edit', id: r.id })))}
      title={`${r.name}${r.planned ? ' · included in planning' : ' · excluded from planning'}`}
    >
      {!plain && (
        <button
          className="xcorner"
          disabled={!!used}
          onClick={(e) => { e.stopPropagation(); ask('role', r.id) }}
          title={used ? `In use by ${used}${used === 1 ? ' member' : ' members'}` : 'Delete role'}
          aria-label={`Delete role ${r.name}`}
        >
          <XIcon />
        </button>
      )}
      <div className="mtop">
        <div className="nmt">
          <b>{r.name}</b>
          <small style={warn ? { color: 'var(--warn)', fontWeight: 700 } : undefined}>{r.planned ? (warn ? 'Pick a platform' : r.platform) : 'Not in planning'}</small>
        </div>
      </div>
    </div>
  )
}

export function RolesView() {
  const model = useModel()
  const miss = model.missPlat()
  return (
    <>
      <p className="help">
        These are the roles you can give the people in your teams. Switch on <b>Included in planning</b> for the roles that build the product, typically developers and QA. Only their available days count towards velocity and forecast, so roles such as Scrum Master or Product Owner stay switched off. A role included in planning also needs a <b>platform</b>, because velocity, forecast and story points are split between Frontend and Backend.
      </p>
      <div className="panel">
        <div className="fsec">Roles</div>
        <div className="rcards">
          {model.sortedRoles().map((r) => <RoleCard key={r.id} r={r} />)}
          <button className="mcard add" onClick={() => openModal({ type: 'role-edit', id: 'new' })}>+ Add roles</button>
        </div>
        {miss.length > 0 && (
          <div className="note">
            <b>!</b>
            <div>
              <b>{miss.map((r) => r.name).join(', ')}</b> {miss.length === 1 ? 'is' : 'are'} included in planning without a platform. Velocity and forecast are split per platform, so {miss.length === 1 ? 'its' : 'their'} days are left out until you pick one.
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export function RoleEditForm({ id }: { id: string }) {
  const a = useArt()
  const model = useModel()
  const r = a.roles.find((x) => x.id === id)
  const [planned, setPlanned] = useState(r?.planned ?? true)
  const [err, setErr] = useState<string | null>(null)
  if (!r) return <RoleAddForm />
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const el = e.currentTarget.elements
    const name = (el.namedItem('name') as HTMLInputElement).value.trim()
    const platform = planned ? ((el.namedItem('platform') as HTMLSelectElement).value as Platform) : ''
    if (!name) return setErr('Please enter a name.')
    if (a.roles.some((x) => x.id !== r.id && x.name.toLowerCase() === name.toLowerCase())) return setErr('A role with this name already exists.')
    update(({ S, ui }) => {
      const ar = artOf(S)
      const rr = ar?.roles.find((x) => x.id === r.id)
      if (ar && rr) {
        ar.teams.forEach((tm) => tm.members.forEach((m) => { if (m.role === rr.name) m.role = name }))
        rr.name = name
        rr.planned = planned
        rr.platform = platform
      }
      ui.modal = null
    })
  }
  return (
    <>
      <h2 style={{ marginBottom: 14 }}>Edit role</h2>
      <form className="ff" onSubmit={submit}>
        <label className="f">Name<input name="name" defaultValue={r.name} autoFocus placeholder="e.g. Backend developer" className={err ? 'invalid' : ''} onInput={() => setErr(null)} /><Err msg={err} /></label>
        <Switch checked={planned} onChange={setPlanned} label="Included in planning" style={{ margin: '4px 0' }} />
        <div hidden={!planned}>
          <label className="f">Platform
            <select name="platform" defaultValue={r.platform || PLATFORMS[0]}>{PLATFORMS.map((pl) => <option key={pl}>{pl}</option>)}</select>
          </label>
          <p className="mute" style={{ margin: '6px 0 0', fontSize: '.8rem' }}>Velocity, forecast and story points are split per platform, so a role included in planning needs one.</p>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <button type="button" className="ghost danger" disabled={!!model.usedRole(r.name)} onClick={() => ask('role', r.id)}>Delete</button>
          <div className="row" style={{ margin: 0 }}>
            <button type="button" onClick={closeModal}>Cancel</button>
            <button className="primary">Save</button>
          </div>
        </div>
      </form>
    </>
  )
}

const raKey = (s: string) => String(s || '').trim().toLowerCase()

/** Add several roles at once, as badges, with suggestions. */
function RoleAddForm() {
  const a = useArt()
  const [draft, setDraft] = useState<{ id: string; name: string }[]>([])
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [planned, setPlanned] = useState(true)
  const inRef = useRef<HTMLInputElement>(null)

  const taken = (n: string, d = draft) => { const k = raKey(n); return a.roles.some((r) => raKey(r.name) === k) || d.some((r) => raKey(r.name) === k) }
  const list = (raw: string) => {
    const q = raKey(raw)
    const typed = String(raw || '').trim().replace(/\s+/g, ' ')
    const l = ROLE_SUGGEST.filter((s) => !taken(s) && (!q || raKey(s).includes(q)))
    l.sort((x, y) => (raKey(y).startsWith(q) ? 1 : 0) - (raKey(x).startsWith(q) ? 1 : 0))
    const items = l.map((s) => ({ name: s, custom: false }))
    if (q && !ROLE_SUGGEST.some((s) => raKey(s) === q) && !taken(typed)) items.push({ name: typed, custom: true })
    return items
  }
  const items = open ? list(text) : []
  const hiIdx = Math.min(hi, Math.max(0, items.length - 1))

  /** Turns raw text into a badge. Returns the new draft, or null when it is a duplicate. */
  const commitText = (raw: string, d = draft): typeof draft | null => {
    const t = raw.trim().replace(/\s+/g, ' ')
    if (!t) return d
    if (taken(t, d)) { setErr(`“${t}” already exists as a role.`); return null }
    const s = ROLE_SUGGEST.find((x) => raKey(x) === raKey(t))
    return [...d, { id: uid(), name: s || t }]
  }
  const pick = (it: { name: string; custom: boolean }) => {
    setErr(null)
    if (taken(it.name)) { setErr(`“${it.name}” already exists as a role.`); return }
    const next = it.custom ? commitText(text) : [...draft, { id: uid(), name: it.name }]
    if (!next) return
    setDraft(next); setText(''); setHi(0); setOpen(false)
    inRef.current?.focus()
  }

  const onChange = (v: string) => {
    setErr(null)
    let d = draft
    if (v.includes(',')) {
      const parts = v.split(',')
      const rest = parts.pop() ?? ''
      for (const p of parts) { const n = commitText(p, d); if (n) d = n }
      setDraft(d)
      v = rest
    }
    setText(v); setHi(0); setOpen(!!v.trim())
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!items.length) { setHi(0); setOpen(true); return }
      setHi((hiIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
    } else if (e.key === 'Enter') {
      if (!text.trim()) return
      e.preventDefault()
      const it = items.length ? items[hiIdx] : null
      if (it) pick(it)
      else { const n = commitText(text); if (n) { setDraft(n); setText(''); setOpen(false) } }
    } else if (e.key === 'Escape' && items.length) {
      e.preventDefault(); e.stopPropagation(); setOpen(false)
    } else if (e.key === 'Backspace' && !text && draft.length) {
      setDraft(draft.slice(0, -1)); setOpen(false)
    }
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const d = commitText(text)
    if (!d) return
    if (!d.length) { setErr('Add at least one role.'); inRef.current?.focus(); return }
    const platform = planned ? ((e.currentTarget.elements.namedItem('platform') as HTMLSelectElement).value as Platform) : ''
    update(({ S, ui }) => {
      const ar = artOf(S)
      d.forEach((x) => { if (ar && !ar.roles.some((r) => raKey(r.name) === raKey(x.name))) ar.roles.push({ id: uid(), name: x.name, planned, platform }) })
      ui.modal = null
    })
  }
  const label = draft.length > 1 ? `Add ${draft.length} roles` : draft.length === 1 ? 'Add role' : 'Add roles'

  return (
    <>
      <h2 style={{ marginBottom: 14 }}>Add roles</h2>
      <form className="ff" autoComplete="off" onSubmit={submit}>
        <div className="ra-wrap">
          <div className="ra-lab">Roles</div>
          <div className={`ra-field${err ? ' invalid' : ''}`} onClick={() => { inRef.current?.focus(); setOpen(true) }}>
            {draft.map((d) => (
              <span className="ra-badge" key={d.id}>
                <span title={d.name}>{d.name}</span>
                <button type="button" className="ra-x" aria-label={`Remove ${d.name}`} onClick={(e) => { e.stopPropagation(); setDraft(draft.filter((x) => x.id !== d.id)); setOpen(false); inRef.current?.focus() }}>
                  <XIcon />
                </button>
              </span>
            ))}
            <input
              ref={inRef}
              className="ra-in"
              autoFocus
              autoComplete="off"
              autoCapitalize="words"
              aria-label="Role name"
              placeholder={draft.length ? 'Add another role' : 'e.g. iOS Engineer'}
              value={text}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => setOpen(false)}
            />
          </div>
          {items.length > 0 && (
            <div className="ra-sug" role="listbox" onMouseDown={(e) => e.preventDefault()}>
              {items.map((s, i) => (
                <div key={s.name + i} className={`ra-opt${i === hiIdx ? ' on' : ''}${s.custom ? ' new' : ''}`} role="option" aria-selected={i === hiIdx} onClick={() => pick(s)}>
                  <b>{s.custom ? `Add “${s.name}”` : s.name}</b>
                  {s.custom && <small>New role</small>}
                </div>
              ))}
            </div>
          )}
          <div><Err msg={err} /></div>
          <p className="mute" style={{ margin: '6px 0 0', fontSize: '.8rem' }}>Type a role and press Enter, or pick a suggestion. Each one becomes a badge, so you can add several before saving.</p>
        </div>
        <Switch checked={planned} onChange={setPlanned} label="Included in planning" style={{ margin: '4px 0' }} />
        <div hidden={!planned}>
          <label className="f">Platform<select name="platform">{PLATFORMS.map((pl) => <option key={pl}>{pl}</option>)}</select></label>
          <p className="mute" style={{ margin: '6px 0 0', fontSize: '.8rem' }}>Applies to all the roles you add here. Velocity, forecast and story points are split per platform, so a role included in planning needs one.</p>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" onClick={closeModal}>Cancel</button>
          <button className="primary">{label}</button>
        </div>
      </form>
    </>
  )
}

/* ---------- feature types ---------- */

function TypeRow({ typeId, draftId, onCreated }: { typeId?: string; draftId?: string; onCreated?: () => void }) {
  const a = useArt()
  const type = typeId ? a.ftypes.find((x) => x.id === typeId) : undefined
  const [v, setV] = useState(type?.name ?? '')
  const usedBy = (n: string) => a.pis.reduce((s, p) => s + p.features.filter((f) => f.type === n).length, 0)
  const unique = (nv: string, selfId?: string) => !a.ftypes.some((x) => x.id !== selfId && x.name.toLowerCase() === nv.toLowerCase())

  if (!type) {
    return (
      <div className="typerow draft">
        <input
          placeholder="New feature type"
          aria-label="New feature type"
          value={v}
          onChange={(e) => {
            const val = e.target.value
            setV(val)
            const nv = val.trim()
            if (!nv || !unique(nv)) return
            update(({ S }) => { const ar = artOf(S); if (ar) ar.ftypes.push({ id: draftId!, name: val, c: nextTypeColor(ar) }) })
            onCreated?.()
          }}
        />
        <span />
      </div>
    )
  }
  const n = usedBy(type.name)
  return (
    <div className="typerow">
      <input
        data-f="ftype.name"
        style={{ '--tc': `var(--tc${type.c})` } as CSSProperties}
        aria-label="Feature type name"
        value={v}
        onChange={(e) => {
          setV(e.target.value)
          // rename live while no feature uses it yet
          const nv = e.target.value.trim()
          if (nv && !usedBy(type.name) && unique(nv, type.id)) update(({ S }) => { const x = artOf(S)?.ftypes.find((x) => x.id === type.id); if (x) x.name = nv })
        }}
        onBlur={() => {
          const nv = v.trim()
          if (nv && nv !== type.name && unique(nv, type.id)) {
            update(({ S }) => {
              const ar = artOf(S)
              const x = ar?.ftypes.find((x) => x.id === type.id)
              if (!ar || !x) return
              ar.pis.forEach((p) => p.features.forEach((f) => { if (f.type === x.name) f.type = nv }))
              x.name = nv
            })
          } else if (nv !== type.name) setV(type.name)
        }}
      />
      <button className="ghost icon" disabled={n > 0} onClick={() => ask('ftype', type.id)} title={n > 0 ? `In use by ${n}${n === 1 ? ' feature' : ' features'}` : 'Delete type'} aria-label={`Delete type ${type.name}`}>
        <XIcon />
      </button>
    </div>
  )
}

export function TypesView() {
  const a = useArt()
  const [draftId, setDraftId] = useState(uid)
  return (
    <>
      <p className="help">Feature types belong to this Agile Release Train and are offered when you add a feature. Type in the empty row to add one. A type that features still use can't be deleted.</p>
      <div className="panel">
        <div className="fsec">Feature types</div>
        <div style={{ marginTop: 6 }}>
          {[
            ...a.ftypes.map((x) => <TypeRow key={x.id} typeId={x.id} />),
            <TypeRow key={draftId} draftId={draftId} onCreated={() => setDraftId(uid())} />,
          ]}
        </div>
      </div>
    </>
  )
}

/* ---------- Program Increments ---------- */

function OffSection({ p }: { p: PI }) {
  const a = useArt()
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const end = piEnd(p)
  const nm = (s: string) => (s === 'all' ? 'All teams (public holiday)' : (a.teams.find((t) => t.id === s) || { name: 'Removed team' }).name)
  const list = p.off.slice().sort((x, y) => x.from.localeCompare(y.from))
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const el = form.elements
    const name = (el.namedItem('name') as HTMLInputElement).value.trim()
    let from = (el.namedItem('from') as HTMLInputElement).value
    let to = (el.namedItem('to') as HTMLInputElement).value || from
    const scope = (el.namedItem('scope') as HTMLSelectElement).value
    if (!name) return setErr({ field: 'name', msg: 'Please enter a name.' })
    if (!from) return setErr({ field: 'from', msg: 'Please pick a start date.' })
    if (to < from) [from, to] = [to, from]
    from = from < p.start ? p.start : from
    to = to > end ? end : to
    if (from > to) return setErr({ field: 'from', msg: 'Those dates fall outside this Program Increment.' })
    update(({ S }) => { artOf(S)?.pis.find((x) => x.id === p.id)?.off.push({ id: uid(), name, from, to, scope }) })
    form.reset()
    nameRef.current?.focus()
  }
  const ec = (f: string) => (err?.field === f ? 'invalid' : '')
  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 18, paddingTop: 16 }}>
      <h3>Days off in this Program Increment</h3>
      <p className="mute">Public holidays apply to all teams, team days off to one team. Dates are limited to {fmt(p.start)} to {fmt(end)}.</p>
      {list.length ? (
        <div className="scroll">
          <table>
            <tbody>
              {list.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{fmt(o.from)}{o.to !== o.from ? ' to ' + fmt(o.to) : ''}</td>
                  <td className="mute">{nm(o.scope)}</td>
                  <td><button className="ghost danger" onClick={() => ask('off', o.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="empty">No days off yet.</p>}
      <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={submit} onInput={() => setErr(null)}>
        <label className="f" style={{ flex: '1 1 200px' }}>Name<input ref={nameRef} name="name" placeholder="e.g. Easter Monday" className={ec('name')} />{err?.field === 'name' && <Err msg={err.msg} />}</label>
        <label className="f">From<input type="date" name="from" min={p.start} max={end} className={ec('from')} />{err?.field === 'from' && <Err msg={err.msg} />}</label>
        <label className="f">To (optional)<input type="date" name="to" min={p.start} max={end} /></label>
        <label className="f">Applies to
          <select name="scope">
            <option value="all">All teams (public holiday)</option>
            {a.teams.map((t) => <option key={t.id} value={t.id}>{t.name} only</option>)}
          </select>
        </label>
        <button className="primary">Add days off</button>
      </form>
    </div>
  )
}

export function PIForm({ id, tab }: { id: string; tab: 'details' | 'off' }) {
  const a = useArt()
  const x = id !== 'new' ? a.pis.find((p) => p.id === id) : undefined
  const v = x || { name: '', start: nextPIStart(a), sprints: 5, weeks: 2 }
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const el = e.currentTarget.elements
    const val = (n: string) => (el.namedItem(n) as HTMLInputElement).value
    const name = val('name').trim()
    if (!name) return setErr({ field: 'name', msg: 'Please enter a name.' })
    if (!val('start')) return setErr({ field: 'start', msg: 'Please pick a start date.' })
    const o = {
      name,
      start: toMonday(val('start')),
      sprints: Math.min(12, Math.max(1, parseInt(val('sprints')) || 1)),
      weeks: Math.min(4, Math.max(1, parseInt(val('weeks')) || 1)),
    }
    update(({ S, ui }) => {
      const ar = artOf(S)
      if (!ar) return
      const ex = x && ar.pis.find((p) => p.id === x.id)
      if (ex) Object.assign(ex, o)
      else {
        const np: PI = { id: uid(), ...o, off: [], features: [], velocity: {}, velUnit: 'md' }
        ar.pis.push(np)
        S.piId = np.id
      }
      ui.modal = null
    })
  }
  const ec = (f: string) => (err?.field === f ? 'invalid' : '')
  const form = (
    <form className="ff" onSubmit={submit} onInput={() => setErr(null)}>
      <label className="f">Name or number<input name="name" defaultValue={v.name} autoFocus placeholder="e.g. 2026.4" className={ec('name')} />{err?.field === 'name' && <Err msg={err.msg} />}</label>
      <label className="f">Start date<input type="date" name="start" defaultValue={v.start} className={ec('start')} />{err?.field === 'start' && <Err msg={err.msg} />}</label>
      <div className="ff2">
        <label className="f">Number of sprints<input type="number" name="sprints" min={1} max={12} defaultValue={v.sprints} /></label>
        <label className="f">Sprint length (weeks)<input type="number" name="weeks" min={1} max={4} defaultValue={v.weeks} /></label>
      </div>
      <p className="mute" style={{ margin: 0, fontSize: '.8rem' }}>Working days are Monday to Friday. The start date moves to the Monday of that week.</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" onClick={closeModal}>Cancel</button>
        <button className="primary">{x ? 'Save' : 'Add Program Increment'}</button>
      </div>
    </form>
  )
  if (!x) return <><h2 style={{ marginBottom: 14 }}>Add Program Increment</h2>{form}</>
  const setTab = (k: 'details' | 'off') => update(({ ui }) => { ui.piTab = k })
  return (
    <>
      <h2 style={{ marginBottom: 12 }}>Edit Program Increment <span className="mute" style={{ fontWeight: 600 }}>{x.name}</span></h2>
      <div className="tabs" role="tablist">
        {([['details', 'Details'], ['off', 'Days off']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>{tab === 'off' ? <div className="nob"><OffSection p={x} /></div> : form}</div>
      {tab !== 'details' && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="primary" onClick={closeModal}>Done</button>
        </div>
      )}
    </>
  )
}

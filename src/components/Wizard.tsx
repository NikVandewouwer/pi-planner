import { useState, type FormEvent } from 'react'
import { PLATFORMS } from '../domain/constants'
import { tvel } from '../domain/model'
import { initials, n2 } from '../domain/util'
import { addTeam, ask } from '../state/actions'
import { artOf, update, useArt, useData, useModel, useUI } from '../state/store'
import { TrashIcon, TypeTag } from './common'
import { Err } from './ModalShell'
import { RolesView, TeamEditor, TypesView } from './settings'

function AddTeamPanel({ autoFocus }: { autoFocus: boolean }) {
  const [err, setErr] = useState<string | null>(null)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('name') as HTMLInputElement
    const name = input.value.trim()
    if (!name) { setErr('Please enter a name.'); input.focus(); return }
    update((d) => { addTeam(d, name) })
    input.value = ''
    input.focus()
  }
  return (
    <div className="panel">
      <div className="fsec">Add a team</div>
      <form className="row" style={{ alignItems: 'flex-end', marginTop: 10 }} onSubmit={submit}>
        <label className="f grow">Team name
          <input name="name" placeholder="e.g. Vega" autoFocus={autoFocus} className={err ? 'invalid' : ''} onInput={() => setErr(null)} />
          <Err msg={err} />
        </label>
        <button className="primary">Add team</button>
      </form>
    </div>
  )
}

/** First-run (and "add train") setup in five steps. */
export function Wizard() {
  const S = useData()
  const ui = useUI()
  const a = useArt()
  const model = useModel()
  const n = ui.step
  let body: React.ReactNode = null
  let next = false
  let nextLabel = 'Continue'

  if (n === 1) {
    body = (
      <>
        <h2>Name</h2>
        <p className="help">An Agile Release Train groups all the teams you plan a Program Increment for. You can rename it later.</p>
        <div className="panel">
          <div className="fsec">Name</div>
          <label className="f" style={{ marginTop: 10 }}>Name of the train
            <input value={a.name} placeholder="e.g. Checkout" autoFocus onChange={(e) => { const v = e.target.value; update(({ S }) => { const x = artOf(S); if (x) x.name = v }) }} />
          </label>
        </div>
      </>
    )
    next = !!a.name.trim()
  } else if (n === 2) {
    body = <><h2>Roles</h2><RolesView /></>
    next = a.roles.length > 0
  } else if (n === 3) {
    body = (
      <>
        <h2>Teams and members</h2>
        <p className="help">Add every team of this train. Each team has its own starting velocity per platform and its own people. You can change all of it later.</p>
        {a.teams.map((t) => (
          <div className="panel" key={t.id}>
            <TeamEditor t={t} withMembers flat />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="ghost danger" onClick={() => ask('team', t.id)}><TrashIcon />Delete team</button>
            </div>
          </div>
        ))}
        <AddTeamPanel autoFocus={!a.teams.length} />
      </>
    )
    next = a.teams.length > 0 && model.allMembers().length > 0
  } else if (n === 4) {
    body = <><h2>Feature types</h2><TypesView /></>
    next = a.ftypes.length > 0
  } else {
    body = (
      <>
        <h2>Ready to go</h2>
        <p className="help">A quick check before you start planning. Anything here can be changed later from the menu.</p>
        <div className="panel"><div className="fsec">Name</div><div className="artline"><b>{a.name}</b></div></div>
        <div className="panel">
          <div className="fsec">Roles</div>
          <div className="rbadges">
            {model.sortedRoles().map((r) => (
              <span key={r.id} className={`rbadge ${r.planned ? 'in' : 'out'}${r.planned && !r.platform ? ' warnp' : ''}`} title={r.planned ? 'Included in planning' : 'Excluded from planning'}>
                {r.name}<small>{r.planned ? (r.platform || 'pick a platform') : ' '}</small>
              </span>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="fsec">Teams</div>
          <div style={{ marginTop: 10 }}>
            {a.teams.map((tm) => (
              <div className="stm" key={tm.id}>
                <div className="secrow">
                  <div>
                    <h4>{tm.name}</h4>
                    <span className="mute" style={{ fontSize: '.82rem' }}>
                      Velocity {PLATFORMS.map((pl, i) => <span key={pl}>{i > 0 && ' · '}{pl} <b style={{ color: 'var(--ink)' }}>{n2(tvel(tm, pl))} SP</b></span>)} per 100 days
                    </span>
                  </div>
                </div>
                <div className="savs">
                  {tm.members.length ? tm.members.map((m) => (
                    <span key={m.id} className={`sav ${model.isPlanned(m.role) ? 'in' : 'out'}`} title={`${m.role}${model.platOf(m.role) ? ' · ' + model.platOf(m.role) : ''}`}>
                      <span className="mav">{initials(m.name)}</span>
                      <span className="tx">{m.name}<small>{m.role}</small></span>
                    </span>
                  )) : <span className="mute">No members</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="fsec">Feature types</div>
          <div className="schips" style={{ marginTop: 10 }}>{a.ftypes.map((x) => <TypeTag key={x.id} art={a} name={x.name} />)}</div>
        </div>
      </>
    )
    next = true
    nextLabel = 'Finish setup'
  }

  const onNext = () =>
    update(({ S, ui }) => {
      if (ui.step < 5) { ui.step++; return }
      S.done = true
      S.piId = artOf(S)?.pis[0]?.id ?? null
      ui.wizard = false
      ui.view = 'plan'
      ui.team = 'all'
      ui.step = 1
    })
  const onCancel = () =>
    update(({ S, ui }) => {
      S.arts = S.arts.filter((x) => x.id !== S.artId)
      S.artId = (S.arts.find((x) => x.id === ui.prevArt) || S.arts[0])?.id ?? null
      S.piId = null
      ui.wizard = false
      ui.step = 1
    })

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>{S.done ? 'Add Agile Release Train' : 'PI Planner'}</h1>
      <p className="mute">{S.done ? 'Set it up in five short steps.' : 'Plan Program Increments with real team availability.'}</p>
      <div className="steps" aria-label={`Step ${n} of 5`}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? 'on' : ''} />)}</div>
      <div style={{ margin: '16px 0' }}>{body}</div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ margin: 0 }}>
          <button disabled={n === 1} onClick={() => update(({ ui }) => { ui.step = Math.max(1, ui.step - 1) })}>Back</button>
          {S.done && <button className="ghost" onClick={onCancel}>Cancel</button>}
        </div>
        <button className="primary" disabled={!next} onClick={onNext}>{nextLabel}</button>
      </div>
    </div>
  )
}

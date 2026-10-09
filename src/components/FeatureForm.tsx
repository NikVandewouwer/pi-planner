import { useState, type FormEvent } from 'react'
import { SIZES, STATUSES } from '../domain/constants'
import type { Model } from '../domain/model'
import type { Estimate, Feature, Platform, Size, Status } from '../domain/types'
import { initials, n2, num, uid } from '../domain/util'
import { ask, closeModal } from '../state/actions'
import { artOf, piOf, update, useArt, useCurPI, useModel, useScopeTeams } from '../state/store'
import { Info } from './common'
import { Err } from './ModalShell'
import { Switch } from './settings'

/** Editable copy of the parts of a feature that interact with each other. Values stay raw strings while typing. */
interface Draft {
  team: string
  platforms: Platform[]
  /** Per estimate key (platforms estimated together share one), not per platform */
  pts: Partial<Record<Estimate, string | number>>
  del: Partial<Record<Estimate, string | number>>
  who: string[]
  wt: Record<string, string | number>
  /** Weights were edited by hand, so they are no longer split evenly */
  manual: boolean
}

/**
 * Split 100% over the assigned people of each selected platform, in proportion to how much of
 * their time they spend on it: two iOS devs get 50/50, a dev and a QA who also tests Android 67/33.
 */
function evenMap(model: Model, d: Draft) {
  const out: Record<string, number> = {}
  model.platforms.filter((p) => d.platforms.includes(p)).forEach((pl) => {
    const ms = model.ftMembers(d.team, [pl]).filter((m) => d.who.includes(m.id))
    const tot = ms.reduce((x, m) => x + model.share(m.role, pl), 0)
    if (!ms.length || !tot) return
    let acc = 0
    ms.forEach((m, i) => {
      if (i < ms.length - 1) {
        const w = Math.floor((model.share(m.role, pl) / tot) * 1000) / 10
        out[m.id] = w
        acc += w
      } else out[m.id] = Math.round((100 - acc) * 10) / 10
    })
  })
  return out
}

function initDraft(model: Model, v: Pick<Feature, 'team' | 'platforms' | 'pts' | 'del' | 'who' | 'wt'>): Draft {
  const d: Draft = { team: v.team, platforms: [...v.platforms], pts: { ...v.pts }, del: { ...v.del }, who: [...v.who], wt: { ...v.wt }, manual: false }
  const em = evenMap(model, d)
  if (!Object.keys(d.wt).length) d.wt = em
  else d.manual = [...new Set([...Object.keys(em), ...Object.keys(d.wt)])].some((id) => Math.abs((num(em[id]) || 0) - (num(d.wt[id]) || 0)) > 0.05)
  return d
}

export function FeatureForm({ id }: { id: string }) {
  const a = useArt()
  const pi = useCurPI()!
  const model = useModel()
  const ts = useScopeTeams()
  const f = id !== 'new' ? pi.features.find((x) => x.id === id) : undefined
  const v: Omit<Feature, 'id'> = f || {
    name: '', team: (ts.length === 1 ? ts[0] : a.teams[0])?.id ?? '', type: a.ftypes[0]?.name || '', size: 'M', status: 'New', spill: false,
    platforms: [], pts: {}, del: {}, who: [], wt: {},
  }
  const [d, setD] = useState<Draft>(() => initDraft(model, v))
  const [spill, setSpill] = useState(!!v.spill)
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null)

  /** Apply a change; re-split weights evenly unless they were edited by hand. */
  const change = (fn: (x: Draft) => void) =>
    setD((prev) => {
      const x: Draft = { ...prev, pts: { ...prev.pts }, del: { ...prev.del }, wt: { ...prev.wt }, who: [...prev.who], platforms: [...prev.platforms] }
      fn(x)
      if (!x.manual) x.wt = evenMap(model, x)
      return x
    })

  const toggleWho = (mid: string, on: boolean) =>
    change((x) => {
      x.who = on ? [...new Set([...x.who, mid])] : x.who.filter((y) => y !== mid)
      if (!x.manual) return
      if (on) {
        // give the newcomer what is left of their platform's 100%
        const mm = model.ftMembers(x.team, model.platforms).find((y) => y.id === mid)
        if (mm) {
          // what is left of 100% on each of their platforms; the tightest one wins
          const rs = model.platsOf(mm.role).filter((pl) => x.platforms.includes(pl)).map((pl) => {
            const others = model.ftMembers(x.team, [pl]).filter((y) => y.id !== mid && x.who.includes(y.id)).reduce((s, y) => s + (num(x.wt[y.id]) || 0), 0)
            return Math.round((100 - others) * 10) / 10
          })
          const r = rs.length ? Math.min(...rs) : 0
          x.wt[mid] = r > 0 ? r : ''
        }
      } else delete x.wt[mid]
    })

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const el = e.currentTarget.elements
    const val = (n: string) => (el.namedItem(n) as HTMLInputElement | HTMLSelectElement).value
    const name = val('name').trim()
    if (!name) return setErr({ field: 'name', msg: 'Enter a name.' })
    if (!d.platforms.length) return setErr({ field: 'plat', msg: 'Pick at least one platform.' })
    const pls = model.platforms.filter((p) => d.platforms.includes(p))
    const ests = [...new Set(pls.map(model.estOf))]
    const ok = new Set(model.ftMembers(d.team, pls).map((m) => m.id))
    const o: Omit<Feature, 'id'> = {
      name, team: d.team, type: val('type'), size: val('size') as Size, status: val('status') as Status, spill,
      platforms: pls, who: d.who.filter((x) => ok.has(x)), wt: {}, pts: {}, del: {}, wtU: 'pct',
    }
    o.who.forEach((id) => { const n = num(d.wt[id]); if (n != null && n > 0) o.wt[id] = Math.min(100, n) })
    ests.forEach((e) => {
      const n = num(d.pts[e])
      if (n != null && n > 0) o.pts[e] = n
      const x = d.del[e] == null ? null : num(d.del[e])
      if (x != null && x >= 0) o.del[e] = x
    })
    update(({ S, ui }) => {
      const p = piOf(S, artOf(S))
      if (!p) return
      const ft = f && p.features.find((x) => x.id === f.id)
      if (ft) Object.assign(ft, o)
      else p.features.push({ id: uid(), ...o })
      ui.modal = null
    })
  }

  const pls = model.platforms.filter((p) => d.platforms.includes(p))
  const ests = [...new Set(pls.map(model.estOf))]
  const whoMembers = model.ftMembers(d.team, d.platforms)
  const str = (x: unknown) => (x != null ? String(x) : '')

  const wsum = d.platforms.flatMap((pl) => {
    let w = 0
    let any = false
    model.ftMembers(d.team, [pl]).filter((m) => d.who.includes(m.id)).forEach((m) => { const n = num(d.wt[m.id]); if (n != null && n > 0) { w += n; any = true } })
    if (!any) return []
    w = Math.round(w * 10) / 10
    if (w === 100) return [<div key={pl} className="wsum ok">{pl}: 100% assigned.</div>]
    if (w < 100) return [<div key={pl} className="wsum warn">{pl}: {n2(w)}% assigned. The other {n2(Math.round((100 - w) * 10) / 10)}% goes to the rest of the platform.</div>]
    return [<div key={pl} className="wsum warn">{pl}: {n2(w)}% assigned, which is more than the estimate.</div>]
  })

  return (
    <>
      <h2 style={{ marginBottom: 14 }}>{f ? 'Edit feature' : 'New feature'}</h2>
      <form className="ff" onSubmit={submit}>
        <div className="fsec">Details</div>
        <label className="f">Name
          <input name="name" defaultValue={v.name} autoFocus className={err?.field === 'name' ? 'invalid' : ''} onInput={() => setErr(null)} />
          {err?.field === 'name' && <Err msg={err.msg} />}
        </label>
        <div className="ff2">
          <label className="f">Team
            <select name="team" value={d.team} onChange={(e) => change((x) => { x.team = e.target.value })}>
              {a.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="f">Type
            <select name="type" defaultValue={v.type}>{a.ftypes.map((x) => <option key={x.id}>{x.name}</option>)}</select>
          </label>
        </div>
        <div className="ff2">
          <label className="f">Size<select name="size" defaultValue={v.size}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="f">Status<select name="status" defaultValue={v.status}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
        <Switch checked={spill} onChange={setSpill} label="Spillover" name="spill" style={{ margin: '2px 0' }} />

        <div className="fsec" style={{ marginTop: 10 }}>
          Delivered by <Info size={16} text="Each platform builds the whole feature, and its share is split over the people you pick. Leave everyone unchecked to plan it on the whole platform." />
        </div>
        <div className="ft-plats">
          {model.platforms.map((pl) => {
            const on = d.platforms.includes(pl)
            return (
              <label key={pl} className={`ft-chip${on ? ' on' : ''}`}>
                <input type="checkbox" checked={on} onChange={(e) => { setErr(null); change((x) => { x.platforms = model.platforms.filter((p) => (p === pl ? e.target.checked : x.platforms.includes(p))) }) }} />
                {pl}
              </label>
            )
          })}
        </div>
        <div>{err?.field === 'plat' && <Err msg={err.msg} />}</div>
        <div className="asg">
          {!d.platforms.length ? (
            <p className="mute" style={{ margin: 0, fontSize: '.8rem' }}>Pick a platform to see its members.</p>
          ) : !whoMembers.length ? (
            <p className="mute" style={{ margin: 0, fontSize: '.8rem' }}>No members of this team work on these platforms.</p>
          ) : (
            <>
              {whoMembers.map((m) => {
                const on = d.who.includes(m.id)
                return (
                  <div className="asgi asgrow" key={m.id}>
                    <label className="asgl">
                      <input type="checkbox" checked={on} onChange={(e) => toggleWho(m.id, e.target.checked)} />
                      <span className="mav">{initials(m.name)}</span>
                      <span className="tx"><b>{m.name}</b><small>{m.role}</small></span>
                    </label>
                    <input
                      className="asgw"
                      inputMode="decimal"
                      placeholder="0"
                      value={on ? str(d.wt[m.id]) : ''}
                      disabled={!on}
                      onChange={(e) => change((x) => { x.wt[m.id] = e.target.value; x.manual = true })}
                      aria-label={`Share of ${m.name} in percent`}
                    />
                    <span className="asgp">%</span>
                  </div>
                )
              })}
              <div style={{ gridColumn: '1/-1' }}>
                {wsum}
                {d.manual && d.who.length > 0 && (
                  <button type="button" className="ghost" style={{ marginTop: 4 }} onClick={() => change((x) => { x.manual = false })}>Split evenly</button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="fsec" style={{ marginTop: 10 }}>
          Story points <Info size={16} text="Platforms estimated together share one number and each builds all of it. Fill in Delivered once the work is done, as it sets the velocity for future PIs." />
        </div>
        <div>
          {!ests.length ? (
            <p className="mute" style={{ margin: 0, fontSize: '.85rem' }}>Pick a platform to estimate this feature.</p>
          ) : (
            <div className="ftp-list">
              {ests.map((est) => (
                <div className="ftp" key={est}>
                  <div className="ftp-h">
                    <b>{pls.filter((pl) => model.estOf(pl) === est).join(' + ')}</b>
                    {pls.filter((pl) => model.estOf(pl) === est).length > 1 && <span className="mute" style={{ fontSize: '.8rem' }}> · built in parallel</span>}
                  </div>
                  <div className="ff2">
                    <label className="f">Estimated
                      <input inputMode="decimal" placeholder="0" value={str(d.pts[est])} onChange={(e) => change((x) => { x.pts[est] = e.target.value })} aria-label={`Estimated story points ${model.estLabel(est)}`} />
                    </label>
                    <label className="f">Delivered
                      <input inputMode="decimal" placeholder="–" value={str(d.del[est])} onChange={(e) => change((x) => { x.del[est] = e.target.value === '' ? undefined : e.target.value })} aria-label={`Delivered story points ${model.estLabel(est)}`} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          {f ? <button type="button" className="ghost danger" onClick={() => ask('feature', f.id)}>Delete</button> : <span />}
          <div className="row" style={{ margin: 0 }}>
            <button type="button" onClick={closeModal}>Cancel</button>
            <button className="primary">{f ? 'Save' : 'Add'}</button>
          </div>
        </div>
      </form>
    </>
  )
}

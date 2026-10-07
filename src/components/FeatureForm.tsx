import { useState, type FormEvent } from 'react'
import { PLATFORMS, SIZES, STATUSES } from '../domain/constants'
import type { Model } from '../domain/model'
import type { Feature, Platform, Size, Status } from '../domain/types'
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
  pts: Partial<Record<Platform, string | number>>
  del: Partial<Record<Platform, string | number>>
  who: string[]
  wt: Record<string, string | number>
  /** Weights were edited by hand, so they are no longer split evenly */
  manual: boolean
}

/** Split 100% evenly over the assigned people of each selected platform. */
function evenMap(model: Model, d: Draft) {
  const out: Record<string, number> = {}
  PLATFORMS.filter((p) => d.platforms.includes(p)).forEach((pl) => {
    const ids = model.ftMembers(d.team, [pl]).filter((m) => d.who.includes(m.id)).map((m) => m.id)
    const n = ids.length
    if (!n) return
    const base = Math.floor(1000 / n) / 10
    let acc = 0
    ids.forEach((id, i) => {
      if (i < n - 1) { out[id] = base; acc += base } else out[id] = Math.round((100 - acc) * 10) / 10
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
        const mm = model.ftMembers(x.team, PLATFORMS).find((y) => y.id === mid)
        if (mm) {
          const pl = model.platOf(mm.role) as Platform
          const others = model.ftMembers(x.team, [pl]).filter((y) => y.id !== mid && x.who.includes(y.id)).reduce((s, y) => s + (num(x.wt[y.id]) || 0), 0)
          const r = Math.round((100 - others) * 10) / 10
          x.wt[mid] = r > 0 ? r : ''
        }
      } else delete x.wt[mid]
    })

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const el = e.currentTarget.elements
    const val = (n: string) => (el.namedItem(n) as HTMLInputElement | HTMLSelectElement).value
    const name = val('name').trim()
    if (!name) return setErr({ field: 'name', msg: 'Please enter a name.' })
    if (!d.platforms.length) return setErr({ field: 'plat', msg: 'Select at least one platform.' })
    const pls = PLATFORMS.filter((p) => d.platforms.includes(p))
    const ok = new Set(model.ftMembers(d.team, pls).map((m) => m.id))
    const o: Omit<Feature, 'id'> = {
      name, team: d.team, type: val('type'), size: val('size') as Size, status: val('status') as Status, spill,
      platforms: pls, who: d.who.filter((x) => ok.has(x)), wt: {}, pts: {}, del: {}, wtU: 'pct',
    }
    o.who.forEach((id) => { const n = num(d.wt[id]); if (n != null && n > 0) o.wt[id] = Math.min(100, n) })
    pls.forEach((pl) => {
      const n = num(d.pts[pl])
      if (n != null && n > 0) o.pts[pl] = n
      const x = d.del[pl] == null ? null : num(d.del[pl])
      if (x != null && x >= 0) o.del[pl] = x
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

  const pls = PLATFORMS.filter((p) => d.platforms.includes(p))
  const whoMembers = model.ftMembers(d.team, d.platforms)
  const str = (x: unknown) => (x != null ? String(x) : '')

  const wsum = d.platforms.flatMap((pl) => {
    let w = 0
    let any = false
    model.ftMembers(d.team, [pl]).filter((m) => d.who.includes(m.id)).forEach((m) => { const n = num(d.wt[m.id]); if (n != null && n > 0) { w += n; any = true } })
    if (!any) return []
    w = Math.round(w * 10) / 10
    if (w === 100) return [<div key={pl} className="wsum ok">{pl}: 100% weighted.</div>]
    if (w < 100) return [<div key={pl} className="wsum warn">{pl}: {n2(w)}% weighted. The remaining {n2(Math.round((100 - w) * 10) / 10)}% is planned on assigned people without a weight, or on everyone of that platform.</div>]
    return [<div key={pl} className="wsum warn">{pl}: {n2(w)}% weighted, more than 100%. The weights are what gets planned.</div>]
  })

  return (
    <>
      <h2 style={{ marginBottom: 14 }}>{f ? 'Edit feature' : 'Add feature'}</h2>
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
          Delivered by <Info size={16} text="Select the platforms working on this feature, then pick who delivers it from the team selected above. Only members of the selected platforms are shown, and their availability per sprint decides when it can finish on the Plan board. Each person gets a share of the platform's estimate, split evenly by default. Change the percentages when the work is not shared equally; per platform they should add up to 100%. The Plan board then places each person's share against their own capacity." />
        </div>
        <div className="ft-plats">
          {PLATFORMS.map((pl) => {
            const on = d.platforms.includes(pl)
            return (
              <label key={pl} className={`ft-chip${on ? ' on' : ''}`}>
                <input type="checkbox" checked={on} onChange={(e) => { setErr(null); change((x) => { x.platforms = PLATFORMS.filter((p) => (p === pl ? e.target.checked : x.platforms.includes(p))) }) }} />
                {pl}
              </label>
            )
          })}
        </div>
        <div>{err?.field === 'plat' && <Err msg={err.msg} />}</div>
        <div className="asg">
          {!d.platforms.length ? (
            <p className="mute" style={{ margin: 0, fontSize: '.8rem' }}>Select a platform above to see its members.</p>
          ) : !whoMembers.length ? (
            <p className="mute" style={{ margin: 0, fontSize: '.8rem' }}>This team has no members included in planning on the selected platforms yet.</p>
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
          Story Points <Info size={16} text="Estimated points count against each platform's forecast. Delivered points are what was really delivered and feed the velocity of this Program Increment. Leave Delivered empty until you know it: empty is not the same as 0." />
        </div>
        <div>
          {!pls.length ? (
            <p className="mute" style={{ margin: 0, fontSize: '.85rem' }}>Select a platform under Delivered by to estimate and track its story points.</p>
          ) : (
            <div className="ftp-list">
              {pls.map((pl) => (
                <div className="ftp" key={pl}>
                  <div className="ftp-h"><b>{pl}</b></div>
                  <div className="ff2">
                    <label className="f">Estimated
                      <input inputMode="decimal" placeholder="0" value={str(d.pts[pl])} onChange={(e) => change((x) => { x.pts[pl] = e.target.value })} aria-label={`Estimated story points ${pl}`} />
                    </label>
                    <label className="f">Delivered
                      <input inputMode="decimal" placeholder="–" value={str(d.del[pl])} onChange={(e) => change((x) => { x.del[pl] = e.target.value === '' ? undefined : e.target.value })} aria-label={`Delivered story points ${pl}`} />
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
            <button className="primary">{f ? 'Save' : 'Add feature'}</button>
          </div>
        </div>
      </form>
    </>
  )
}

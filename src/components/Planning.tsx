import { useMemo } from 'react'
import { PLATFORMS, SIZES, STATUSES } from '../domain/constants'
import { fdel, fdelT, fpts, ftotal, type PlanRow } from '../domain/model'
import { buildPlan, type PlanCard } from '../domain/plan'
import type { Feature, PI, Platform, Team } from '../domain/types'
import { fmt, initials, n2 } from '../domain/util'
import { ask, openModal } from '../state/actions'
import { update, useArt, useModel, useScopeTeams, useUI } from '../state/store'
import { BarRow, Dash, Info, PenIcon, Spc, TrashIcon, TypeTag, WhoStack } from './common'
import { clickable } from './clickable'
import { GroupChart } from './GroupChart'

const SP = ({ v }: { v: number }) => <>{n2(v)} <span className="unit">SP</span></>

function Tile({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div className="tile">
      <div className="mute">{label}{tip && <> <Info text={tip} /></>}</div>
      {children}
    </div>
  )
}

export function PlanningView({ pi }: { pi: PI }) {
  const model = useModel()
  const teams = useScopeTeams()
  const ps = useMemo(() => model.planStats(pi, teams), [model, pi, teams])
  const plan = useMemo(() => buildPlan(model, ps, pi, teams), [model, ps, pi, teams])
  return (
    <>
      <VelocitySection ps={ps} teams={teams} />
      <ForecastSection rows={ps.rows} teams={teams} />
      <FeaturesSection pi={pi} teams={teams} />
      <PlanSection plan={plan} teams={teams} />
    </>
  )
}

/* ---------- 1. velocity ---------- */

const SER: [string, Platform | null, string][] = [['Overall', null, 's0'], ...PLATFORMS.map((pl, i) => [pl, pl, 's' + (i + 1)] as [string, Platform, string])]

function VelocitySection({ ps, teams }: { ps: ReturnType<ReturnType<typeof useModel>['planStats']>; teams: Team[] }) {
  const model = useModel()
  const vTeams = teams
  const inScope = (r: PlanRow) => vTeams.some((t) => t.id === r.t.id)
  const weighted = (rs: PlanRow[]) => {
    const d = rs.reduce((x, r) => x + r.pd, 0)
    return d ? rs.reduce((x, r) => x + r.rate * r.pd, 0) / d : rs.length ? rs.reduce((x, r) => x + r.rate, 0) / rs.length : null
  }
  const vAll = weighted(ps.rows.filter(inScope)) ?? 0
  const vRate = (pl: Platform) => weighted(ps.rows.filter((r) => r.pl === pl && inScope(r)))

  const tagB = (r: PlanRow) =>
    r.basis === 'history'
      ? <span className="tag" title={`Average of ${r.n} earlier Program Increment${r.n === 1 ? '' : 's'}`}>Average</span>
      : <span className="tag off" title="The team's default velocity">Default</span>

  const vcard = (label: string, val: number | null, txt: string) => (
    <Tile key={label} label={label} tip={txt}>
      <div className="bignum">{val == null ? <span className="mute">n/a</span> : <SP v={val} />}</div>
    </Tile>
  )

  return (
    <div className="panel">
      <div className="head">
        <h3><span className="step">1</span>Velocity <Info text="Velocity is always normalised to story points per 100 days of the days that count in planning, so Program Increments of different lengths and availability can be compared. The cards show the velocity used for this Program Increment's forecast: the average of all earlier Program Increments that have delivered story points, or the team default." /></h3>
      </div>
      <div className="tiles">
        {vcard('Overall', vAll, 'Story points delivered per 100 planning days, across all platforms. The average of every earlier Program Increment that has delivered story points; without history the team default is used.')}
        {PLATFORMS.map((pl) => vcard(pl, vRate(pl), `Story points delivered per 100 planning days of ${pl} roles. The average of every earlier Program Increment with delivered ${pl} story points; without history the team default is used.`))}
      </div>
      <div style={{ marginTop: 6 }}>
        {teams.map((tm) => {
          const pp = ps.past.filter((p) => model.hasDeliv(p, [tm], null))
          const rs = ps.rows.filter((r) => r.t.id === tm.id)
          return (
            <div key={tm.id}>
              <div className="tghead">{tm.name}</div>
              {pp.length ? (
                <div className="chart">
                  <h4>Historical velocity <Info text="Story points (SP) delivered per 100 days of planning days, so Program Increments of different lengths and availability can be compared. The dashed lines are the averages used for this one's forecast, overall and per platform." /></h4>
                  <GroupChart cats={pp.map((p) => p.name)} series={SER.map(([n, pl, c]) => ({ name: n, cls: c, vals: pp.map((p) => model.nvel(p, [tm], pl)) }))} avgLines />
                </div>
              ) : (
                <div className="empty" style={{ margin: '8px 0' }}>No delivered story points recorded yet. Add them as Delivered on the features of earlier Program Increments.</div>
              )}
              {rs.length > 0 && (
                <div style={{ marginTop: 10 }} className="scroll">
                  <table className="vt fx vtab">
                    <colgroup><col style={{ width: 110 }} /><col /></colgroup>
                    <tbody>
                      <tr><th>Platform</th><th title="Story points (SP) per 100 days">Velocity</th></tr>
                      {rs.map((r) => <tr key={r.pl}><td>{r.pl}</td><td><b>{n2(r.rate)}</b> {tagB(r)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- 2. forecast ---------- */

function ForecastSection({ rows, teams }: { rows: PlanRow[]; teams: Team[] }) {
  const tgt = rows.reduce((x, r) => x + r.fc, 0)
  const com = rows.reduce((x, r) => x + r.committed, 0)
  const fpill = (c: number, f: number) => {
    const q = f ? Math.round((c / f) * 100) : 0
    const tn = q > 100 ? 'bad' : q >= 90 ? 'warn' : q > 0 ? 'good' : 'none'
    const st = q > 100 ? 'over' : q >= 100 ? 'done' : ''
    return <Spc d={c} p={f} q={q} cls={`${st} t-${tn}`} title={`${n2(c)} SP committed of ${n2(f)} SP forecast (${q}%)`} />
  }
  const ftile = (label: string, d: number, f: number, tip: string) => {
    const q = f ? Math.round((d / f) * 100) : 0
    const tn = q > 100 ? 'bad' : q >= 90 ? 'warn' : 'good'
    return (
      <Tile key={label} label={label} tip={tip}>
        <div className="bignum"><SP v={f} /></div>
        <BarRow q={q} toneName={tn} style={{ marginTop: 10 }} />
      </Tile>
    )
  }
  const sumPl = (pl: Platform, k: 'fc' | 'committed') => rows.filter((r) => r.pl === pl).reduce((x, r) => x + r[k], 0)
  return (
    <div className="panel">
      <div className="head">
        <h3><span className="step">2</span>Forecast <Info text="Forecast = velocity × planning days available this Program Increment ÷ 100. The days come from the Availability tab: only roles that count in planning, after leave and days off. It is the number of story points (SP) you can reasonably commit to, in total and per platform. The cards show committed of forecast: how much of it is already booked with features that have the status Committed." /></h3>
      </div>
      <div className="tiles">
        {ftile('Overall', com, tgt, 'How many story points you can take on this Program Increment: velocity × planning days ÷ 100, across all platforms. The bar shows how much of it is already committed.')}
        {PLATFORMS.filter((pl) => rows.some((r) => r.pl === pl)).map((pl) =>
          ftile(pl, sumPl(pl, 'committed'), sumPl(pl, 'fc'), `How many ${pl} story points you can take on: ${pl} velocity × ${pl} planning days ÷ 100. The bar shows how much of it is already committed.`),
        )}
      </div>
      {teams.map((tm) => {
        const rs = rows.filter((r) => r.t.id === tm.id)
        if (!rs.length) return null
        return (
          <div key={tm.id}>
            <div className="tghead">{tm.name}</div>
            <div className="scroll">
              <table className="vt fx ptab">
                <colgroup><col style={{ width: 110 }} /><col /><col /><col style={{ width: 160 }} /></colgroup>
                <tbody>
                  <tr><th>Platform</th><th>Velocity</th><th>Planning days</th><th title="Story points committed of the forecast">Forecast</th></tr>
                  {rs.map((r) => <tr key={r.pl}><td>{r.pl}</td><td>{n2(r.rate)}</td><td>{n2(r.pd)}</td><td>{fpill(r.committed, r.fc)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- 3. features ---------- */

function FeaturesSection({ pi, teams }: { pi: PI; teams: Team[] }) {
  const a = useArt()
  const model = useModel()
  const ui = useUI()
  const feats = pi.features.filter((f) => teams.some((t) => t.id === f.team))

  const grp = (s?: string) => {
    const g = s ? feats.filter((f) => f.status === s) : feats
    return { n: g.length, p: g.reduce((x, f) => x + ftotal(f), 0), d: g.reduce((x, f) => x + fdelT(f), 0) }
  }
  const card = (l: string, g: ReturnType<typeof grp>, txt: string) => {
    const q = g.p ? Math.min(100, Math.round((g.d / g.p) * 100)) : 0
    const tn = !g.p ? 'none' : q >= 80 ? 'good' : q >= 50 ? 'warn' : q > 0 ? 'bad' : 'none'
    return (
      <Tile key={l} label={l} tip={txt}>
        <div className="bignum"><SP v={g.p} /></div>
        <BarRow q={q} toneName={tn} style={{ marginTop: 10 }} title={`${g.n} ${g.n === 1 ? 'feature' : 'features'} · ${q}% delivered`} />
      </Tile>
    )
  }
  const ratio = (d: number, p: number) => {
    if (!d && !p) return <Dash />
    const q = p ? Math.min(100, Math.round((d / p) * 100)) : 0
    const st = !p ? 'zero' : q >= 100 ? 'done' : q > 0 ? 'part' : ''
    const tn = q >= 80 ? 'good' : q >= 50 ? 'warn' : q > 0 ? 'bad' : 'none'
    return <Spc d={d} p={p} q={q} cls={`${st} t-${tn}`} title={`${n2(d)} SP delivered of ${n2(p)} SP estimated`} showBar={!!p} />
  }

  const teamName = (f: Feature) => a.teams.find((x) => x.id === f.team)?.name || ''
  const srt = ui.fsort
  const cmp: Record<string, (x: Feature, y: Feature) => number> = {
    team: (x, y) => teamName(x).localeCompare(teamName(y)),
    name: (x, y) => x.name.localeCompare(y.name),
    type: (x, y) => String(x.type).localeCompare(String(y.type)),
    size: (x, y) => SIZES.indexOf(x.size) - SIZES.indexOf(y.size),
    status: (x, y) => STATUSES.indexOf(x.status) - STATUSES.indexOf(y.status),
    spill: (x, y) => Number(!!x.spill) - Number(!!y.spill),
  }
  const cf = srt?.key.startsWith('pl:') ? (x: Feature, y: Feature) => fpts(x, srt.key.slice(3) as Platform) - fpts(y, srt.key.slice(3) as Platform) : srt && cmp[srt.key]
  const shown = cf ? [...feats].sort((x, y) => (srt!.dir === 'desc' ? -1 : 1) * cf(x, y)) : feats
  const sortBy = (k: string) => update(({ ui }) => { ui.fsort = { key: k, dir: ui.fsort?.key === k && ui.fsort.dir === 'asc' ? 'desc' : 'asc' } })
  const th = (k: string, l: string, right?: boolean) => (
    <th key={k} style={right ? { textAlign: 'right' } : undefined} aria-sort={srt?.key === k ? (srt.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button className={`sorth${srt?.key === k ? ' on' : ''}`} onClick={() => sortBy(k)} title={`Sort by ${l.toLowerCase()}`}>
        {l}<span className="arr">{srt?.key === k ? (srt.dir === 'desc' ? '▼' : '▲') : '↕'}</span>
      </button>
    </th>
  )

  return (
    <div className="panel">
      <div className="head">
        <h3><span className="step">3</span>Features <Info text="The Frontend and Backend columns show delivered of estimated story points (SP), with a small bar for progress. For example 0/50 means nothing delivered yet of 50 SP estimated." /></h3>
        <button className="primary" onClick={() => openModal({ type: 'feature', id: 'new' })}>Add feature</button>
      </div>
      <div className="tiles">
        {card('Overall', grp(), 'Story points estimated for every feature of the selected teams, added up over all platforms. The bar shows how much of it is delivered.')}
        {card('Committed', grp('Committed'), 'Features with the status Committed, the ones you promised for this Program Increment. Their estimated points count against the forecast. The bar shows how much of it is delivered.')}
        {card('Uncommitted', grp('Uncommitted'), 'Features with the status Uncommitted: planned as stretch work, so they do not count against the forecast. The bar shows how much of it is delivered.')}
        {card('New', grp('New'), 'Features with the status New: added but not yet decided on, so they do not count against the forecast. The bar shows how much of it is delivered.')}
      </div>
      {feats.length ? teams.map((tm) => {
        const g = shown.filter((f) => f.team === tm.id)
        if (!g.length) return null
        return (
          <div key={tm.id}>
            <div className="tghead">{tm.name}</div>
            <div className="scroll">
              <table className="vt fx ftab">
                <colgroup>
                  <col /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 64 }} />
                  {PLATFORMS.map((pl) => <col key={pl} style={{ width: 110 }} />)}
                  <col style={{ width: 118 }} /><col style={{ width: 92 }} />
                </colgroup>
                <tbody>
                  <tr>
                    {th('name', 'Feature')}{th('type', 'Type')}{th('status', 'Status')}{th('size', 'Size')}
                    {PLATFORMS.map((pl) => th('pl:' + pl, pl, true))}
                    <th>People</th><th />
                  </tr>
                  {g.map((f) => {
                    const wi = model.wtInfo(f).filter((x) => x.diff !== 0)
                    return (
                      <tr key={f.id}>
                        <td title={f.name}>
                          <b>{f.name}</b>
                          {f.spill && <> <span className="tag warn" title="Spillover from a previous Program Increment">Spillover</span></>}
                          {wi.length > 0 && <> <span className="tag warn" title={wi.map((x) => `${x.pl}: ${n2(x.w)}% weighted`).join(' · ')}>Check weights</span></>}
                        </td>
                        <td><TypeTag art={a} name={f.type} /></td>
                        <td><span className={`tag${f.status === 'Committed' ? '' : ' off'}`}>{f.status}</span></td>
                        <td>{f.size}</td>
                        {PLATFORMS.map((pl) => <td key={pl} style={{ textAlign: 'right' }}>{ratio(fdel(f, pl), fpts(f, pl))}</td>)}
                        <td>{model.fAsg(f).length ? <WhoStack ms={model.fAsg(f)} wt={f.wt} /> : <Dash />}</td>
                        <td style={{ width: 88 }}>
                          <div className="rowacts">
                            <button className="ghost icon" onClick={() => openModal({ type: 'feature', id: f.id })} title="Edit feature" aria-label={`Edit ${f.name}`}><PenIcon /></button>
                            <button className="ghost icon danger" onClick={() => ask('feature', f.id)} title="Delete feature" aria-label={`Delete ${f.name}`}><TrashIcon /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      }) : <div className="empty" style={{ marginTop: 12 }}>No features yet. Add the first feature you want to plan in this Program Increment.</div>}
    </div>
  )
}

/* ---------- 4. plan board ---------- */

function PlanSection({ plan, teams }: { plan: ReturnType<typeof buildPlan>; teams: Team[] }) {
  const a = useArt()
  const model = useModel()

  const colCard = ({ f, tm, who, part }: PlanCard, key: string) => {
    const ms = who ? tm.members.filter((m) => who.includes(m.id)) : model.fAsg(f)
    return (
      <div key={key} className={`pcard ${f.status}${part ? ' part' : ''}`} {...clickable(() => openModal({ type: 'feature', id: f.id }))} title={`${f.status} · ${tm.name}${part ? ' · continues in a later sprint' : ''}`}>
        <b>{f.name}</b>
        <small>{teams.length > 1 ? tm.name + ' · ' : ''}{PLATFORMS.filter((p2) => fpts(f, p2)).map((p2) => `${p2} ${n2(fpts(f, p2))}`).join(' · ') || 'no points'}</small>
        <div className="pfoot"><TypeTag art={a} name={f.type} /><WhoStack ms={ms} max={4} wt={f.wt} /></div>
      </div>
    )
  }
  const colCaps = (i: number) =>
    PLATFORMS.map((p2) => {
      const c = teams.reduce((x, tm) => x + (plan.cap[tm.id + '|' + p2] || [])[i], 0)
      const l = teams.reduce((x, tm) => x + (plan.left[tm.id + '|' + p2] || [])[i], 0)
      if (!c) return null
      const used = c - l
      const q = Math.round((used / c) * 100)
      const tn = !used ? 'none' : q >= 100 ? 'bad' : q >= 90 ? 'warn' : 'good'
      return (
        <div key={p2} className={`cap t-${tn}`} title={`${p2}: ${used ? n2(used) + ' of ' + n2(c) + ' SP planned in this sprint' : 'nothing planned in this sprint (' + n2(c) + ' SP capacity)'}`}>
          <span>{p2}</span><span className="bar"><i style={{ width: `${Math.min(100, q)}%` }} /></span><span>{q}%</span>
        </div>
      )
    }).filter(Boolean)
  const lcell = (u: number, c: number) => {
    if (!c && !u) return <Dash />
    const q = c ? Math.round((u / c) * 100) : 0
    const tn = !u ? 'none' : q >= 100 ? 'bad' : q >= 90 ? 'warn' : 'good'
    return <Spc d={u} p={c} q={q} cls={`t-${tn}`} title={`${n2(u)} SP planned of ${n2(c)} SP capacity (${q}%)`} />
  }
  const loads = teams.map((tm) => {
    const rows = tm.members
      .filter((m) => plan.mcap[m.id])
      .map((m) => {
        const c = plan.mcap[m.id]
        const used = c.map((x, i) => x - plan.mleft[m.id][i])
        return { m, c, used, sh: plan.short[m.id] || 0, tot: used.reduce((x, y) => x + y, 0) }
      })
      .filter((r) => r.tot > 1e-6 || r.sh > 1e-6)
    return { tm, rows }
  }).filter((x) => x.rows.length)

  return (
    <div className="panel">
      <div className="head">
        <h3><span className="step">4</span>Plan <Info text={'Each feature is shown in every sprint where someone works on it: dotted border in the earlier sprints, solid border in the sprint where it finishes. The avatars show who spends capacity on it in that sprint. Features are filled in priority order, Committed first. Capacity is counted per person: their available days in that sprint × their team velocity ÷ 100. When a feature has weights, each person\'s share (a percentage of the platform\'s estimate) is planned on their own capacity, so several people can work on it in parallel. Whatever is not weighted is taken from the assigned people without a weight, or from everyone of that platform in the team when nobody is assigned. A feature finishes in the last sprint any of its platforms needs, and what no longer fits lands in "Beyond this Program Increment". The bar under each sprint shows how much of that sprint\'s capacity is booked per platform: green below 90%, orange from 90%, red when the sprint is fully booked (100%), and grey when nothing is planned. Work is planned from the first sprint onward, so once everything fits the later sprints stay empty.'} /></h3>
      </div>
      <div className="board">
        {plan.sp.map((d, i) => {
          const caps = colCaps(i)
          return (
            <div className="col" key={i}>
              <div className="colhd">
                <b>Sprint {i + 1}</b>
                <small>{fmt(d[0])} – {fmt(d[d.length - 1])}</small>
                <div className="caps">{caps.length ? caps : <span className="colempty">No capacity</span>}</div>
              </div>
              {plan.cols[i].length ? plan.cols[i].map((c, j) => colCard(c, c.f.id + ':' + j)) : <div className="colempty">Nothing planned here</div>}
            </div>
          )
        })}
        {plan.over.length > 0 && (
          <div className="col over">
            <div className="colhd"><b>Beyond this Program Increment</b><small>Does not fit the forecast</small></div>
            {plan.over.map((c, j) => colCard(c, c.f.id + ':o' + j))}
          </div>
        )}
      </div>
      {loads.length > 0 && (
        <>
          <div className="fsec" style={{ marginTop: 18 }}>
            Load per person <Info text="How much of each person's capacity is planned in each sprint, in story points (SP): planned / capacity. Capacity is their available days × team velocity ÷ 100. Green below 90%, orange from 90%, red when the sprint is fully booked. The Over column shows the part of a person's weighted share that does not fit in this Program Increment, so that feature lands in Beyond this Program Increment." />
          </div>
          {loads.map(({ tm, rows }) => (
            <div key={tm.id}>
              <div className="tghead">{tm.name}</div>
              <div className="scroll">
                <table className="vt fx ltab">
                  <colgroup><col style={{ width: 200 }} />{plan.sp.map((_, i) => <col key={i} style={{ width: 136 }} />)}<col style={{ width: 120 }} /></colgroup>
                  <tbody>
                    <tr><th>Person</th>{plan.sp.map((_, i) => <th key={i}>Sprint {i + 1}</th>)}<th>Over</th></tr>
                    {rows.map((r) => (
                      <tr key={r.m.id}>
                        <td title={`${r.m.name} · ${r.m.role}`}>
                          <div className="nmi"><span className="av">{initials(r.m.name)}</span><div className="nmt">{r.m.name}<small>{r.m.role}</small></div></div>
                        </td>
                        {r.c.map((c, i) => <td key={i}>{lcell(r.used[i], c)}</td>)}
                        <td>{r.sh > 1e-6 ? <span className="tag bad" title={`${n2(r.sh)} SP of this person's share does not fit in this Program Increment`}>{n2(r.sh)} SP over</span> : <Dash />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

import { Fragment, useMemo, type CSSProperties } from 'react'
import { SIZES, STATUSES } from '../domain/constants'
import { fdelEst, fest, type PlanRow } from '../domain/model'
import { buildPlan, planLanes, type PlanCard } from '../domain/plan'
import type { Feature, PI, Team } from '../domain/types'
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
      <ForecastSection rows={ps.rows} teams={teams} pi={pi} />
      <FeaturesSection pi={pi} teams={teams} />
      <PlanSection plan={plan} teams={teams} />
    </>
  )
}

/* ---------- 1. velocity ---------- */

function VelocitySection({ ps, teams }: { ps: ReturnType<ReturnType<typeof useModel>['planStats']>; teams: Team[] }) {
  const model = useModel()
  const vTeams = teams
  const inScope = (r: PlanRow) => vTeams.some((t) => t.id === r.t.id)
  const weighted = (rs: PlanRow[]) => {
    const d = rs.reduce((x, r) => x + r.pd, 0)
    return d ? rs.reduce((x, r) => x + r.rate * r.pd, 0) / d : rs.length ? rs.reduce((x, r) => x + r.rate, 0) / rs.length : null
  }
  const vRate = (pl: string) => weighted(ps.rows.filter((r) => r.pl === pl && inScope(r)))

  const tagB = (r: PlanRow) =>
    r.basis === 'history'
      ? <span className="tag" title={`Average of ${r.n} earlier ${r.n === 1 ? 'PI' : 'PIs'}`}>Average</span>
      : <span className="tag off" title="Team default">Default</span>

  const vcard = (label: string, val: number | null, txt: string) => (
    <Tile key={label} label={label} tip={txt}>
      <div className="bignum">{val == null ? <span className="mute">n/a</span> : <SP v={val} />}</div>
    </Tile>
  )

  return (
    <div className="panel">
      <div className="head">
        <h3><span className="step">1</span>Velocity <Info text="Story points delivered per 100 planning days, for each platform. It is the average of earlier PIs, or the team default while there is no history yet." /></h3>
      </div>
      <div className="tiles">
        {model.platforms.map((pl) => vcard(pl, vRate(pl), ''))}
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
                  <h4>Historical velocity <Info text="Velocity per earlier PI. The dashed lines show the averages used for this forecast." /></h4>
                  <GroupChart cats={pp.map((p) => p.name)} series={model.platforms.map((pl, i) => ({ name: pl, cls: 's' + ((i % 6) + 1), vals: pp.map((p) => model.nvel(p, [tm], pl)) }))} avgLines />
                </div>
              ) : (
                <div className="empty" style={{ margin: '8px 0' }}>No delivered story points yet. Fill in Delivered on the features of earlier PIs.</div>
              )}
              {rs.length > 0 && (
                <div style={{ marginTop: 10 }} className="scroll">
                  <table className="vt fx vtab">
                    <colgroup><col style={{ width: 110 }} /><col /></colgroup>
                    <tbody>
                      <tr><th>Platform</th><th title="Story points per 100 planning days">Velocity</th></tr>
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

function ForecastSection({ rows, teams, pi }: { rows: PlanRow[]; teams: Team[]; pi: PI }) {
  const model = useModel()
  // A ticket's estimate counts once, however many platforms build it in parallel. What an
  // estimate can take on is limited by the slowest platform that shares it.
  const tgt = teams.reduce((x, tm) => x + model.ests.reduce((y, est) => {
    const fcs = rows.filter((r) => r.t.id === tm.id && model.estOf(r.pl) === est).map((r) => r.fc)
    return y + (fcs.length ? Math.min(...fcs) : 0)
  }, 0), 0)
  const com = pi.features
    .filter((f) => f.status === 'Committed' && teams.some((t) => t.id === f.team))
    .reduce((x, f) => x + model.ftotal(f), 0)
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
  const sumPl = (pl: string, k: 'fc' | 'committed') => rows.filter((r) => r.pl === pl).reduce((x, r) => x + r[k], 0)
  return (
    <div className="panel">
      <div className="head">
        <h3><span className="step">2</span>Forecast <Info text="Story points each platform can deliver this PI: velocity × planning days ÷ 100. The bars show how much is already committed." /></h3>
      </div>
      <div className="tiles">
        {ftile('Overall', com, tgt, 'Each feature counts once, limited by the slowest platform that builds it.')}
        {model.platforms.filter((pl) => rows.some((r) => r.pl === pl)).map((pl) =>
          ftile(pl, sumPl(pl, 'committed'), sumPl(pl, 'fc'), ''),
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
                  <tr><th>Platform</th><th>Velocity</th><th>Planning days</th><th title="Committed of forecast">Forecast</th></tr>
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
    return { n: g.length, p: g.reduce((x, f) => x + model.ftotal(f), 0), d: g.reduce((x, f) => x + model.fdelT(f), 0) }
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
  const cf = srt?.key.startsWith('est:') ? (x: Feature, y: Feature) => fest(x, srt.key.slice(4)) - fest(y, srt.key.slice(4)) : srt && cmp[srt.key]
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
        <h3><span className="step">3</span>Features <Info text="Delivered of estimated story points. Platforms estimated together share a column, and the feature counts once." /></h3>
        <button className="primary" onClick={() => openModal({ type: 'feature', id: 'new' })}>Add</button>
      </div>
      <div className="tiles">
        {card('Overall', grp(), 'All features. The bar shows how much is delivered.')}
        {card('Committed', grp('Committed'), 'Promised for this PI, and counted against the forecast.')}
        {card('Uncommitted', grp('Uncommitted'), 'Stretch work, not counted against the forecast.')}
        {card('New', grp('New'), 'Not decided on yet, and not counted against the forecast.')}
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
                  {model.ests.map((e) => <col key={e} style={{ width: 110 }} />)}
                  <col style={{ width: 118 }} /><col style={{ width: 92 }} />
                </colgroup>
                <tbody>
                  <tr>
                    {th('name', 'Feature')}{th('type', 'Type')}{th('status', 'Status')}{th('size', 'Size')}
                    {model.ests.map((e) => th('est:' + e, model.estLabel(e), true))}
                    <th>People</th><th />
                  </tr>
                  {g.map((f) => {
                    const wi = model.wtInfo(f).filter((x) => x.diff !== 0)
                    return (
                      <tr key={f.id}>
                        <td title={f.name}>
                          <b>{f.name}</b>
                          {f.spill && <> <span className="tag warn" title="Carried over from an earlier PI">Spillover</span></>}
                          {wi.length > 0 && <> <span className="tag warn" title={wi.map((x) => `${x.pl}: ${n2(x.w)}% assigned`).join(' · ')}>Check shares</span></>}
                        </td>
                        <td><TypeTag art={a} name={f.type} /></td>
                        <td><span className={`tag${f.status === 'Committed' ? '' : ' off'}`}>{f.status}</span></td>
                        <td>{f.size}</td>
                        {model.ests.map((e) => <td key={e} style={{ textAlign: 'right' }} title={model.fests(f).includes(e) ? `Built by ${f.platforms.filter((pl) => model.estOf(pl) === e).join(' and ')}` : undefined}>{model.fests(f).includes(e) ? ratio(fdelEst(f, e), fest(f, e)) : <Dash />}</td>)}
                        <td>{model.fAsg(f).length ? <WhoStack ms={model.fAsg(f)} wt={f.wt} /> : <Dash />}</td>
                        <td style={{ width: 88 }}>
                          <div className="rowacts">
                            <button className="ghost icon" onClick={() => openModal({ type: 'feature', id: f.id })} title="Edit" aria-label={`Edit ${f.name}`}><PenIcon /></button>
                            <button className="ghost icon danger" onClick={() => ask('feature', f.id)} title="Delete" aria-label={`Delete ${f.name}`}><TrashIcon /></button>
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
      }) : <div className="empty" style={{ marginTop: 12 }}>No features yet.</div>}
    </div>
  )
}

/* ---------- 4. plan board ---------- */

/** Story points on a plan card: one decimal is enough there. */
const sp1 = (x: number) => Math.round(x * 10) / 10

/** Badge colour per status, matching the card's left border. */
const STATUS_TAG: Record<Feature['status'], string> = { Committed: '', Uncommitted: ' warn', New: ' off' }

function PlanSection({ plan, teams }: { plan: ReturnType<typeof buildPlan>; teams: Team[] }) {
  const a = useArt()
  const model = useModel()

  // "After this PI" is the last column, so a feature that spills over keeps its row there too
  const { lanes, rows } = useMemo(() => planLanes([...plan.cols, plan.over]), [plan.cols, plan.over])

  /**
   * Per estimate, the SP planned in this sprint (or left after the PI) out of the estimate, e.g.
   * "iOS + Android 4 of 10 SP". Platforms of one estimate that progress differently are listed
   * apart: "iOS 4 · Android 6 of 10 SP".
   */
  const ptsLines = (f: Feature, pts: PlanCard['pts'], after: boolean) =>
    model.fests(f).filter((e) => fest(f, e)).flatMap((e) => {
      const total = `${sp1(fest(f, e))} SP`
      const pls = model.platformsOfEst(e).filter((pl) => f.platforms.includes(pl))
      if (!pts) return [`${pls.join(' + ')} ${total}`]
      const vals = pls.map((pl) => pts[pl] || 0)
      if (vals.every((v) => v < 0.05)) return []
      const amount = vals.every((v) => Math.abs(v - vals[0]) < 0.05) ? `${pls.join(' + ')} ${sp1(vals[0])}` : pls.map((pl, k) => `${pl} ${sp1(vals[k])}`).join(' · ')
      return [`${amount} of ${total}${after ? ' left' : ''}`]
    })

  const colCard = ({ f, tm, who, part, pts }: PlanCard, key: string, style: CSSProperties, after = false) => {
    const ms = who ? tm.members.filter((m) => who.includes(m.id)) : model.fAsg(f)
    const lines = ptsLines(f, pts, after)
    return (
      <div key={key} style={style} className={`pcard ${f.status}${part ? ' part' : ''}`} {...clickable(() => openModal({ type: 'feature', id: f.id }))} title={`${f.status} · ${tm.name}${part ? ' · continues later' : ''}`}>
        <b>{f.name}</b>
        <WhoStack ms={ms} max={4} wt={f.wt} />
        {teams.length > 1 && <small>{tm.name}</small>}
        {lines.length ? lines.map((l) => <small key={l}>{l}</small>) : <small>No points</small>}
        <div className="pfoot">
          <div className="ptags"><span className={`tag${STATUS_TAG[f.status]}`}>{f.status}</span><TypeTag art={a} name={f.type} /></div>
        </div>
      </div>
    )
  }
  const colCaps = (i: number) =>
    model.platforms.map((p2) => {
      const c = teams.reduce((x, tm) => x + (plan.cap[tm.id + '|' + p2] || [])[i], 0)
      const l = teams.reduce((x, tm) => x + (plan.left[tm.id + '|' + p2] || [])[i], 0)
      if (!c) return null
      const used = c - l
      const q = Math.round((used / c) * 100)
      const tn = !used ? 'none' : q >= 100 ? 'bad' : q >= 90 ? 'warn' : 'good'
      return (
        <div key={p2} className={`cap t-${tn}`} title={`${p2}: ${n2(used)} of ${n2(c)} SP planned`}>
          <span>{p2}</span><span className="bar"><i style={{ width: `${Math.min(100, q)}%` }} /></span><span>{q}%</span>
        </div>
      )
    }).filter(Boolean)
  const lcell = (u: number, c: number) => {
    if (!c && !u) return <Dash />
    const q = c ? Math.round((u / c) * 100) : 0
    const tn = !u ? 'none' : q >= 100 ? 'bad' : q >= 90 ? 'warn' : 'good'
    return <Spc d={u} p={c} q={q} cls={`t-${tn}`} title={`${n2(u)} of ${n2(c)} SP planned`} />
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
        <h3><span className="step">4</span>Plan <Info text="Features are planned in order of status, Committed first, on each person's capacity per sprint. A dotted border means the work continues in a later sprint. What doesn't fit starts where there is capacity and continues after this PI." /></h3>
      </div>
      {/* one grid for all sprints: every feature has its own row (lane), also in "After this PI" */}
      <div className="board" style={{ gridTemplateRows: `auto repeat(${Math.max(rows, 1)}, auto) 2px` }}>
        {plan.sp.map((d, i) => {
          const caps = colCaps(i)
          const col = i + 1
          return (
            <Fragment key={i}>
              <div className="colbg" style={{ gridColumn: col }} />
              <div className="colhd" style={{ gridColumn: col, gridRow: 1 }}>
                <b>Sprint {i + 1}</b>
                <small>{fmt(d[0])} – {fmt(d[d.length - 1])}</small>
                <div className="caps">{caps.length ? caps : <span className="colempty">No capacity</span>}</div>
              </div>
              {plan.cols[i].length
                ? plan.cols[i].map((c, j) => colCard(c, c.f.id + ':' + j, { gridColumn: col, gridRow: lanes[i][j] + 2 }))
                : <div className="colempty" style={{ gridColumn: col, gridRow: 2 }}>Nothing planned</div>}
            </Fragment>
          )
        })}
        {plan.over.length > 0 && (
          <>
            <div className="colbg over" style={{ gridColumn: plan.sp.length + 1 }} />
            <div className="colhd" style={{ gridColumn: plan.sp.length + 1, gridRow: 1 }}><b>After this PI</b><small>Doesn't fit</small></div>
            {plan.over.map((c, j) => colCard(c, c.f.id + ':o' + j, { gridColumn: plan.sp.length + 1, gridRow: lanes[plan.sp.length][j] + 2 }, true))}
          </>
        )}
      </div>
      {loads.length > 0 && (
        <>
          <div className="fsec" style={{ marginTop: 18 }}>
            Load per person <Info text="Planned of available story points per person and sprint. Over is work that doesn't fit in this PI." />
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
                        <td>{r.sh > 1e-6 ? <span className="tag bad" title={`${n2(r.sh)} SP doesn't fit in this PI`}>{n2(r.sh)} SP over</span> : <Dash />}</td>
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

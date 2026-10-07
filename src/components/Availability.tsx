import { PLATFORMS, VALS } from '../domain/constants'
import { gridScope } from '../domain/grid'
import type { Member, PI, Team } from '../domain/types'
import { fmt, initials, n2, piSprints, tone, vcls, vlabel, wd } from '../domain/util'
import { ask, openModal, paintCell } from '../state/actions'
import { update, useArt, useModel, useScopeTeams, useUI } from '../state/store'
import { BarRow, CycleIcon, Info } from './common'
import { clickable } from './clickable'
import { Switch } from './settings'

const pct = (c: { a: number; w: number }) => (c.w ? Math.round((c.a / c.w) * 100) : 0)

function Kpi({ label, list, statKey, pi }: { label: string; list: Member[]; statKey: string; pi: PI }) {
  const model = useModel()
  const sp = piSprints(pi)
  const c = model.cap(list, sp.flat())
  const pc = pct(c)
  return (
    <div className="kpi" data-act="details" {...clickable(() => openModal({ type: 'role', id: statKey }))} aria-label={`Availability details for ${label}`}>
      <div className="kt" title={label}>{label}</div>
      <div className="mute">{list.length} {list.length === 1 ? 'person' : 'people'}</div>
      <div className="num">{n2(c.a)}<span className="mute" style={{ fontSize: '.85rem', fontWeight: 400 }}> / {c.w} days</span></div>
      <BarRow q={pc} toneName={tone(pc)} />
      <div className="spark">
        {sp.map((d, i) => {
          const s = model.cap(list, d)
          const q = pct(s)
          return (
            <div key={i} className={`sc t-${tone(q)}`} title={`Sprint ${i + 1}: ${n2(s.a)} of ${s.w} days — ${q}%`}>
              <b className="pc">{q}%</b>
              <i style={{ height: Math.max(4, Math.round(q * 0.42)) }} />
              <span>S{i + 1}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CapacityView({ pi }: { pi: PI }) {
  const a = useArt()
  const ui = useUI()
  const model = useModel()
  const teams = useScopeTeams()
  const ms = teams.flatMap((t) => t.members)
  if (!ms.length) return <div className="empty">Add team members to see availability.</div>

  const g = gridScope(model, pi, teams, ui.gf)
  const starts = new Set(g.sp.map((s) => s[0]))
  const inPlan = ms.filter((m) => model.isPlanned(m.role))
  const outPlan = ms.filter((m) => !model.isPlanned(m.role))
  const noPlat = a.roles.filter((r) => r.planned && !r.platform && ms.some((m) => m.role === r.name))
  const setGf = (key: string, v: string | boolean) => update(({ ui }) => { ui.gf = { ...g.gf, [key]: v } })

  const groups = teams.map((t) => ({ t, ms: t.members.filter(g.passes) })).filter((x) => x.ms.length)

  return (
    <>
      {noPlat.length > 0 && (
        <div className="empty" style={{ textAlign: 'left', marginBottom: 12, borderColor: 'var(--warn)', color: 'var(--ink)' }}>
          <b>{noPlat.map((r) => r.name).join(', ')}</b> {noPlat.length === 1 ? 'counts' : 'count'} in planning but {noPlat.length === 1 ? 'has' : 'have'} no platform, so {noPlat.length === 1 ? 'its' : 'their'} days are left out of the forecast. Set a platform under Roles.
        </div>
      )}
      <div className="head">
        <h3>Availability overview <Info text={`Sprint bars show the percentage of days available in that sprint. Days in ${pi.name}. Roles that count in planning are set per role under Roles. Green is 80% or more, orange 60% or more, red below. Select a card for details by sprint, team and role.`} /></h3>
      </div>
      <div className="kpis">
        <Kpi label="Everyone" list={ms} statKey="__all" pi={pi} />
        {inPlan.length > 0 && <Kpi label="Included in planning" list={inPlan} statKey="__planned" pi={pi} />}
        {outPlan.length > 0 && <Kpi label="Excluded from planning" list={outPlan} statKey="__unplanned" pi={pi} />}
        {PLATFORMS.map((pl) => {
          const grp = ms.filter((m) => model.platOf(m.role) === pl)
          return grp.length ? <Kpi key={pl} label={pl} list={grp} statKey={'__plat:' + pl} pi={pi} /> : null
        })}
      </div>

      <div className="panel">
        <div className="head">
          <h3>Daily availability <Info text="Hatched days are public holidays or team days off. Untouched days count as 1." /></h3>
          <div className="brush" role="radiogroup" aria-label="Brush">
            <span className="mute">Brush</span>
            <button role="radio" aria-checked={ui.paint === 'cycle'} className={`sw0${ui.paint === 'cycle' ? ' on' : ''}`} onClick={() => update(({ ui }) => { ui.paint = 'cycle' })} title="Cycle: click a day to step through the values" aria-label="Cycle values">
              <CycleIcon />
            </button>
            {VALS.map((v) => (
              <button key={v} role="radio" aria-checked={ui.paint === String(v)} className={`sw0 ${vcls(v)}${ui.paint === String(v) ? ' on' : ''}`} onClick={() => update(({ ui }) => { ui.paint = String(v) })} title={`Set a day to ${v}`}>
                {vlabel(v)}
              </button>
            ))}
          </div>
        </div>
        <div className="fbar">
          <label className="pill"><span>Planning</span>
            <select value={g.gf.group} onChange={(e) => setGf('group', e.target.value)} aria-label="Filter by planning group">
              <option value="all">Everyone</option>
              <option value="unplanned">Excluded from planning</option>
              <option value="planned">Included in planning</option>
            </select>
          </label>
          <label className="pill"><span>Platform</span>
            <select value={g.gf.platform} onChange={(e) => setGf('platform', e.target.value)} aria-label="Filter by platform">
              <option value="all">All platforms</option>
              {PLATFORMS.map((pl) => <option key={pl}>{pl}</option>)}
            </select>
          </label>
          <label className="pill"><span>Role</span>
            <select value={g.role} onChange={(e) => setGf('role', e.target.value)} aria-label="Filter by role">
              <option value="all">All roles</option>
              {g.groupRoles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="pill"><span>Sprint</span>
            <select value={String(g.gf.sprint)} onChange={(e) => setGf('sprint', e.target.value)} aria-label="Filter by sprint">
              <option value="all">All sprints</option>
              {g.sp.map((_, i) => <option key={i} value={String(i)}>Sprint {i + 1}</option>)}
            </select>
          </label>
          <Switch checked={g.gf.absent} onChange={(v) => setGf('absent', v)} label="Only with absences" ariaLabel="Only members with absences" />
          {g.filtered && <button className="ghost" onClick={() => update(({ ui }) => { ui.gf = undefined })}>Clear filters</button>}
        </div>
        <div className="scroll">
          <table className="grid">
            <tbody>
              <tr>
                <th className="sticky" />
                {g.gsp.map((d) => (
                  <th key={d[0]} className="sp" colSpan={d.length}>Sprint {g.sp.indexOf(d) + 1} <span className="mute" style={{ fontWeight: 400 }}>{fmt(d[0])}</span></th>
                ))}
              </tr>
              <tr>
                <th className="sticky mute">{g.gf.sprint === 'all' ? 'Member (total)' : 'Member (sprint total)'}</th>
                {g.days.map((d) => (
                  <th key={d} className={`dh${starts.has(d) ? ' sb' : ''}`} title={`${wd(d)} ${fmt(d)}`}>{wd(d)[0]}<br />{+d.slice(8)}</th>
                ))}
              </tr>
              {groups.map(({ t, ms }) => <TeamRows key={t.id} t={t} ms={ms} days={g.days} starts={starts} />)}
            </tbody>
          </table>
          {!groups.length && <div className="empty" style={{ marginTop: 10 }}>No members match these filters.</div>}
        </div>
      </div>
    </>
  )
}

function TeamRows({ t, ms, days, starts }: { t: Team; ms: Member[]; days: string[]; starts: Set<string> }) {
  const model = useModel()
  const c = model.cap(ms, days)
  return (
    <>
      <tr>
        <td className="sticky tnm">
          <span className="in">
            {t.name} <span className="mute" style={{ fontWeight: 400 }}>{n2(c.a)} / {c.w}</span>
            <button className="ghost icon rst" onClick={() => ask('resetAvail', t.id)} title={`Reset availability of ${t.name}`} aria-label={`Reset availability of ${t.name}`}>
              <CycleIcon size={14} />
            </button>
          </span>
        </td>
        <td colSpan={days.length} />
      </tr>
      {ms.map((m) => (
        <tr key={m.id}>
          <td className="sticky nm">
            <div className="nmi">
              <button className="av" onClick={() => openModal({ type: 'member', id: m.id })} title={`Availability details for ${m.name}`} aria-label={`Availability details for ${m.name}`}>{initials(m.name)}</button>
              <div className="nmt">{m.name}<small>{m.role}</small></div>
              <b title="Available days in the shown period">{n2(model.sum(m.id, days))}</b>
            </div>
          </td>
          {days.map((d) => {
            const cl = model.closedFor(t.id, d)
            const v = model.getA(m.id, d)
            return (
              <td key={d} className={starts.has(d) ? 'sb' : ''}>
                <button
                  className={`c ${cl ? 'cl' : vcls(v)}`}
                  disabled={!!cl}
                  onClick={() => paintCell(m.id, d)}
                  title={`${m.name}, ${wd(d)} ${fmt(d)}${cl ? ' - ' + cl.name : ''}`}
                  aria-label={`${m.name} ${fmt(d)}: ${cl ? 'day off' : v}`}
                >
                  {cl ? '' : vlabel(v)}
                </button>
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

/* ---------- availability details (modal) ---------- */

type StatMember = Member & { team: string; tid: string }

function RCard({ badge, title, sub, c }: { badge?: string; title: string; sub: string; c: { a: number; w: number } }) {
  const q = pct(c)
  return (
    <div className={`rc${badge ? '' : ' nb'} t-${tone(q)}`}>
      {badge && <span className="rb">{badge}</span>}
      <div className="rt"><b>{title}</b><small>{sub}</small></div>
      <div className="rn"><b>{q}%</b><small>{n2(c.a)} / {c.w} days</small></div>
      <div className="rbar"><div className="bar"><i style={{ width: `${q}%` }} /></div></div>
    </div>
  )
}

function StatSections({ list, withTabs, pi }: { list: StatMember[]; withTabs: boolean; pi: PI }) {
  const model = useModel()
  const ui = useUI()
  const teams = useScopeTeams()
  const a = useArt()
  const sp = piSprints(pi)
  const all = sp.flat()
  const tot = model.cap(list, all)
  const off = all.length * list.length - tot.w
  const q = pct(tot)
  const top = (
    <div className="hero">
      <h3>Availability</h3>
      <div className="mute" style={{ fontSize: '.85rem', marginTop: 2 }}>
        {list.length} {list.length === 1 ? 'person' : 'people'}{off ? ` · excludes ${off} ${off === 1 ? 'day' : 'days'} off from public holidays and team days off` : ''}
      </div>
      <div className="num">{n2(tot.a)}<span className="mute" style={{ fontSize: '.9rem', fontWeight: 400 }}> / {tot.w} days</span></div>
      <BarRow q={q} toneName={tone(q)} style={{ marginTop: 10 }} />
    </div>
  )
  const sprints = (
    <div className="rlist">
      {sp.map((d, i) => <RCard key={i} title={'Sprint ' + (i + 1)} sub={fmt(d[0]) + ' to ' + fmt(d[d.length - 1])} c={model.cap(list, d)} />)}
    </div>
  )
  if (!withTabs) return <>{top}<div className="sub">By sprint</div>{sprints}</>

  const tab = ui.statTab || 'sprint'
  const group = (key: string, name: string, ms: StatMember[], subFn: (m: StatMember) => string) => (
    <div className="tgroup" key={key}>
      <RCard title={name} sub={ms.length + (ms.length === 1 ? ' person' : ' people')} c={model.cap(ms, all)} />
      <div className="rlist inner">
        {ms.map((m) => <RCard key={m.id} badge={initials(m.name)} title={m.name} sub={subFn(m)} c={model.cap([m], all)} />)}
      </div>
    </div>
  )
  let content = sprints
  if (tab === 'team') content = <>{teams.map((t) => ({ t, ms: list.filter((m) => m.tid === t.id) })).filter((x) => x.ms.length).map((x) => group(x.t.id, x.t.name, x.ms, (m) => m.role))}</>
  else if (tab === 'role') content = <>{a.roles.map((r) => ({ r, ms: list.filter((m) => m.role === r.name) })).filter((x) => x.ms.length).map((x) => group(x.r.id, x.r.name, x.ms, (m) => m.team))}</>
  else if (tab === 'platform') content = <>{[...PLATFORMS, ''].map((pl) => ({ pl, ms: list.filter((m) => model.platOf(m.role) === pl) })).filter((x) => x.ms.length).map((x) => group(x.pl || 'other', x.pl || 'Other roles', x.ms, (m) => m.role))}</>

  return (
    <>
      {top}
      <div className="tabs" role="tablist" style={{ marginTop: 20 }}>
        {([['sprint', 'By sprint'], ['team', 'By team'], ['platform', 'By platform'], ['role', 'By role']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => update(({ ui }) => { ui.statTab = k })}>{l}</button>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>{content}</div>
    </>
  )
}

export function RoleStats({ role, pi }: { role: string; pi: PI }) {
  const a = useArt()
  const model = useModel()
  const teams = useScopeTeams()
  const ui = useUI()
  const list: StatMember[] = teams.flatMap((t) =>
    t.members
      .filter((m) =>
        role === '__all' ||
        (role === '__planned' ? model.isPlanned(m.role)
          : role === '__unplanned' ? !model.isPlanned(m.role)
          : role.startsWith('__plat:') ? model.platOf(m.role) === role.slice(7)
          : m.role === role))
      .map((m) => ({ ...m, team: t.name, tid: t.id })),
  )
  const scope = ui.team !== 'all' && teams.length === 1 ? teams[0].name : 'All teams'
  const titles: Record<string, string> = { __all: 'Everyone', __planned: 'Included in planning', __unplanned: 'Excluded from planning' }
  return (
    <>
      <div className="rhead">
        <h2>{titles[role] || (role.startsWith('__plat:') ? role.slice(7) : role)}</h2>
        <div className="chips2">{list.map((m) => <span className="mchip" key={m.id}><span className="mav">{initials(m.name)}</span>{m.name}</span>)}</div>
      </div>
      <p className="mute" style={{ margin: '8px 0 0' }}>{a.name} · {pi.name} · {scope}</p>
      <StatSections list={list} withTabs pi={pi} />
    </>
  )
}

export function MemberStats({ id, pi }: { id: string; pi: PI }) {
  const a = useArt()
  const model = useModel()
  const f = model.findMember(id)
  if (!f) return null
  const { m, tm } = f
  return (
    <>
      <div className="rhead">
        <span className="mav big">{initials(m.name)}</span>
        <h2>{m.name}</h2>
        <div className="chips2"><span className="mchip plain">{m.role}</span><span className="mchip plain">{tm.name}</span></div>
      </div>
      <p className="mute" style={{ margin: '8px 0 0' }}>{a.name} · {pi.name}</p>
      <StatSections list={[{ ...m, team: tm.name, tid: tm.id }]} withTabs={false} pi={pi} />
    </>
  )
}

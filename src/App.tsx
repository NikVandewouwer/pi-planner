import { useEffect } from 'react'
import { CapacityView } from './components/Availability'
import { openModal } from './state/actions'
import { PlanningView } from './components/Planning'
import { AppBar, ModalView, Nav, SetupModal } from './components/Shell'
import { Wizard } from './components/Wizard'
import { CloudNotice } from './components/CloudNotice'
import { useCloud } from './state/cloud'
import { update, useApp, useArt, useCurPI, useData, useUI } from './state/store'

function PlanView() {
  const a = useArt()
  const pi = useCurPI()
  const ui = useUI()
  const hasMembers = a.teams.some((x) => x.members.length)
  let body: React.ReactNode
  if (!pi) {
    body = (
      <div className="empty" style={{ padding: '56px 20px' }}>
        <h2 style={{ marginBottom: 8, color: 'var(--ink)' }}>No PIs yet</h2>
        <p style={{ margin: '0 0 16px' }}>A Program Increment (PI) is the period you plan availability and features for.</p>
        <button className="primary" onClick={() => openModal({ type: 'pi', id: 'new' })}>Add</button>
      </div>
    )
  } else if (!hasMembers) {
    body = <div className="empty">Add a team with members to start planning. <button onClick={() => update(({ ui }) => { ui.view = 'setup' })}>Settings</button></div>
  } else body = ui.mainTab === 'planning' ? <PlanningView pi={pi} /> : <CapacityView pi={pi} />
  return (
    <>
      {pi && (
        <div className="tabs full" role="tablist">
          {([['availability', 'Availability'], ['planning', 'Planning']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={ui.mainTab === k} className={ui.mainTab === k ? 'on' : ''} onClick={() => update(({ ui }) => { ui.mainTab = k })}>{l}</button>
          ))}
        </div>
      )}
      {body}
    </>
  )
}

function useTheme() {
  const theme = useApp((s) => s.ui.theme || 'system')
  const palette = useApp((s) => s.ui.palette || 'forest')
  useEffect(() => {
    const r = document.documentElement
    if (theme === 'system') r.removeAttribute('data-theme')
    else r.setAttribute('data-theme', theme)
    if (palette === 'forest') r.removeAttribute('data-palette')
    else r.setAttribute('data-palette', palette)
  }, [theme, palette])
}

/** Escape closes the topmost layer: modal, then settings, then menu. */
function useEscape() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const { S, ui } = useApp.getState()
      if (!S.done) return
      if (ui.modal) update(({ ui }) => { ui.modal = null })
      else if (ui.view === 'setup') update(({ ui }) => { ui.view = 'plan' })
      else if (ui.menu) update(({ ui }) => { ui.menu = false })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

function Footer() {
  const commitUrl = __APP_REPO__ && __APP_COMMIT__ ? `${__APP_REPO__}/commit/${__APP_COMMIT__}` : ''
  return (
    <footer className="appfoot">
      PI Planner v{__APP_VERSION__}
      {__APP_COMMIT__ && (
        <>
          {' · '}
          {commitUrl ? <a href={commitUrl} target="_blank" rel="noreferrer" title="Build commit">{__APP_COMMIT__}</a> : __APP_COMMIT__}
        </>
      )}
    </footer>
  )
}

export default function App() {
  const S = useData()
  const ui = useUI()
  useTheme()
  useEscape()
  const loading = useCloud((s) => s.status === 'loading') && !S.done
  const main = S.done && !ui.wizard
  return (
    <>
      <header className="appbar"><div className="in"><AppBar /></div></header>
      <div className="wrap">
        <CloudNotice />
        {loading ? (
          <div className="empty" style={{ padding: '56px 20px' }}>Loading…</div>
        ) : main ? (
          <>
            <PlanView />
            <Nav />
            {ui.view === 'setup' && <SetupModal />}
            <ModalView />
          </>
        ) : (
          <>
            <Wizard />
            <ModalView />
          </>
        )}
        <Footer />
      </div>
    </>
  )
}

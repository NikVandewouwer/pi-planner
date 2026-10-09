import { dismissNotice, useCloud, type Status } from '../state/cloud'
import { XIcon } from './common'

/** "14:32", or "9 Oct, 14:32" when it wasn't today. */
function when(t: number) {
  const d = new Date(t)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`
}

const DOT: Record<Status, string> = { local: '', loading: 'var(--mute)', saving: 'var(--mute)', saved: 'var(--good)', offline: 'var(--bad)', error: 'var(--bad)' }

/** Whether the trains are saved to the database, in the menu's Data section. */
export function SyncStatus() {
  const { status, syncedAt } = useCloud()
  const foot = { border: 0, padding: '10px 2px 0', margin: 0 }
  if (status === 'local') return <p className="nft" style={foot}>Data is stored in this browser only. Export it to keep a backup or move it to another browser.</p>
  const last = syncedAt ? ` Last synced at ${when(syncedAt)}.` : ''
  const text =
    status === 'saved' ? (syncedAt ? `Synced at ${when(syncedAt)}` : 'Synced')
    : status === 'saving' ? 'Saving…'
    : status === 'loading' ? 'Loading…'
    : status === 'offline' ? `Offline. Changes sync when you’re back online.${last}`
    : `Not synced. Trying again.${last}`
  return (
    <>
      <p role="status" style={{ display: 'flex', gap: 8, alignItems: 'baseline', margin: '10px 2px 0', fontSize: '.85rem', fontWeight: 600, color: status === 'offline' || status === 'error' ? 'var(--bad)' : 'var(--ink)' }}>
        <span aria-hidden style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: DOT[status], transform: 'translateY(-1px)' }} />
        <span>{text}</span>
      </p>
      <p className="nft" style={{ ...foot, paddingTop: 4 }}>Trains are shared with everyone who opens this app.</p>
    </>
  )
}

/** Shown after a train changed elsewhere in a way that affected local edits. */
export function CloudNotice() {
  const notice = useCloud((s) => s.notice)
  if (!notice) return null
  return (
    <div className="note" role="status" style={{ alignItems: 'center', margin: '10px 0' }}>
      <span className="grow">{notice}</span>
      <button className="ghost icon" onClick={dismissNotice} title="Close" aria-label="Close"><XIcon /></button>
    </div>
  )
}

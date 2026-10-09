import { dismissNotice, useCloud } from '../state/cloud'
import { XIcon } from './common'

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

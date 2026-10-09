import { useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { PlatformDef } from '../domain/types'
import { addPlatform, addToFeaturesOfEst, ask, linkPlatform, missingFromEst, renamePlatform } from '../state/actions'
import { artOf, update, useModel } from '../state/store'
import { Info, XIcon } from './common'
import { Err } from './ModalShell'

/** Drop target: an estimate key (a box of platforms estimated together), or "new" to estimate on its own. */
type Target = string

interface Drag {
  id: string
  name: string
  x: number
  y: number
  over: Target | null
}

const GripIcon = () => (
  <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true" fill="currentColor">
    <circle cx="2.5" cy="2.5" r="1.3" /><circle cx="7.5" cy="2.5" r="1.3" />
    <circle cx="2.5" cy="7" r="1.3" /><circle cx="7.5" cy="7" r="1.3" />
    <circle cx="2.5" cy="11.5" r="1.3" /><circle cx="7.5" cy="11.5" r="1.3" />
  </svg>
)

function PlatformChip({ p, onDragStart, onKeyMove, dragging }: {
  p: PlatformDef
  onDragStart: (e: ReactPointerEvent, p: PlatformDef) => void
  onKeyMove: (p: PlatformDef, dir: -1 | 1) => void
  dragging: boolean
}) {
  const model = useModel()
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const used = model.art.roles.filter((r) => r.platforms.includes(p.name)).length

  const commit = (v: string) => {
    let e: string | null = null
    update(({ S }) => { const a = artOf(S); if (a) e = renamePlatform(a, p.id, v) })
    setErr(e)
    if (!e) setEditing(false)
  }

  return (
    <span
      className={`pchip${dragging ? ' dragging' : ''}${err ? ' invalid' : ''}`}
      onPointerDown={(e) => { if (!editing && !(e.target as HTMLElement).closest('button.x')) onDragStart(e, p) }}
      onKeyDown={(e: KeyboardEvent) => {
        if (editing) return
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onKeyMove(p, e.key === 'ArrowUp' ? -1 : 1) }
      }}
      title={err ?? 'Drag to move, click to rename'}
    >
      <span className="grip"><GripIcon /></span>
      {editing ? (
        <input
          className="pname"
          autoFocus
          defaultValue={p.name}
          aria-label={`Rename ${p.name}`}
          size={Math.max(4, p.name.length + 1)}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { e.stopPropagation(); setErr(null); setEditing(false) }
          }}
        />
      ) : (
        <button type="button" className="pname" onClick={() => setEditing(true)} aria-label={`${p.name}. Press Enter to rename, arrow up or down to move between groups.`}>
          {p.name}
        </button>
      )}
      <button
        type="button"
        className="x"
        disabled={used > 0}
        onClick={() => ask('platform', p.id)}
        title={used ? `Used by ${used} ${used === 1 ? 'role' : 'roles'}` : 'Delete'}
        aria-label={`Delete platform ${p.name}`}
      >
        <XIcon size={13} />
      </button>
    </span>
  )
}

/**
 * Platforms as chips in boxes. Each box is one estimate: platforms in the same box are
 * estimated together and each builds the whole ticket in parallel (iOS + Android).
 * Drag a chip to another box to join it, or onto the "own estimate" zone to split it off.
 */
export function PlatformsView() {
  const model = useModel()
  const a = model.art
  const [drag, setDrag] = useState<Drag | null>(null)
  const [err, setErr] = useState<string | null>(null)
  /** Platform that just joined others, to offer adding it to their existing tickets */
  const [offer, setOffer] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const groups = model.ests.map((est) => ({ est, ps: a.platforms.filter((p) => p.est === est) }))

  const move = (id: string, target: Target) => {
    const p = a.platforms.find((x) => x.id === id)
    if (!p || target === p.est) return
    const alone = !a.platforms.some((x) => x !== p && x.est === p.est)
    if (target === 'new' && alone) return
    const partner = target === 'new' ? undefined : a.platforms.find((x) => x.est === target && x.id !== id)
    update(({ S }) => { const ar = artOf(S); if (ar) linkPlatform(ar, id, partner?.id ?? null) })
    setOffer(partner ? id : null)
  }

  const onDragStart = (e: ReactPointerEvent, p: PlatformDef) => {
    if (e.button !== 0) return
    const sx = e.clientX
    const sy = e.clientY
    let started = false
    const targetAt = (x: number, y: number) =>
      ((document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null)
    const onMove = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
      started = true
      ev.preventDefault()
      setDrag({ id: p.id, name: p.name, x: ev.clientX, y: ev.clientY, over: targetAt(ev.clientX, ev.clientY) })
    }
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      if (!started) return
      // a drag is not a click: don't open the rename field
      const swallow = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault() }
      window.addEventListener('click', swallow, true)
      setTimeout(() => window.removeEventListener('click', swallow, true), 0)
      const t = ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null
      setDrag(null)
      if (t) move(p.id, t)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  /** Keyboard: move a chip into the previous / next box, or past the last one to estimate it on its own. */
  const onKeyMove = (p: PlatformDef, dir: -1 | 1) => {
    const i = groups.findIndex((g) => g.est === p.est)
    const j = i + dir
    if (j < 0) return
    move(p.id, j >= groups.length ? 'new' : groups[j].est)
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const name = nameRef.current?.value ?? ''
    let msg: string | null = null
    update(({ S }) => { const ar = artOf(S); if (ar) msg = addPlatform(ar, name) })
    setErr(msg)
    if (!msg) { e.currentTarget.reset(); nameRef.current?.focus() }
  }

  const offered = a.platforms.find((p) => p.id === offer)
  const missing = offered ? missingFromEst(a, offered.id) : []

  return (
    <>
      <p className="help">What your teams build on, each with its own velocity and capacity.</p>
      <div className="panel">
        <div className="fsec">Platforms <Info size={14} text="Platforms in the same box are estimated together and each builds the whole feature, like iOS and Android. Drag a platform to move it." /></div>
        <div className="pgroups">
          {groups.map((g) => (
            <div key={g.est} data-drop={g.est} className={`pgroup${drag?.over === g.est && !g.ps.some((p) => p.id === drag.id) ? ' over' : ''}`}>
              <div className="pchips">
                {g.ps.map((p) => <PlatformChip key={p.id} p={p} onDragStart={onDragStart} onKeyMove={onKeyMove} dragging={drag?.id === p.id} />)}
              </div>
              <span className="plab">{g.ps.length > 1 ? 'Estimated together' : 'Estimated separately'}</span>
            </div>
          ))}
          {drag && a.platforms.some((x) => x.id !== drag.id && x.est === a.platforms.find((p) => p.id === drag.id)?.est) && (
            <div data-drop="new" className={`pgroup pnew${drag.over === 'new' ? ' over' : ''}`}>Drop here to estimate separately</div>
          )}
        </div>
        <form className="padd" onSubmit={submit} onInput={() => setErr(null)}>
          <input ref={nameRef} placeholder="e.g. Web" aria-label="New platform name" className={err ? 'invalid' : ''} />
          <button className="primary">Add</button>
        </form>
        <Err msg={err} />
        {offered && missing.length > 0 && (
          <div className="note">
            <b>?</b>
            <div>
              Add {offered.name} to the {missing.length === 1 ? 'feature' : `${missing.length} features`} that {model.partnersOf(offered.name).join(' and ')} already {missing.length === 1 ? 'builds' : 'build'}? Its velocity then includes them.
              <div className="row" style={{ margin: '8px 0 0' }}>
                <button className="primary" onClick={() => { update(({ S }) => { const ar = artOf(S); if (ar) addToFeaturesOfEst(ar, offered.id) }); setOffer(null) }}>
                  Add
                </button>
                <button className="ghost" onClick={() => setOffer(null)}>Skip</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {drag && (
        <span className="pchip pghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <span className="grip"><GripIcon /></span><span className="pname">{drag.name}</span>
        </span>
      )}
    </>
  )
}

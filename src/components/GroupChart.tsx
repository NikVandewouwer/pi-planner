import { n2 } from '../domain/util'

export interface Series {
  name: string
  cls: string
  vals: (number | null)[]
}

/** Grouped bar chart (SVG) with optional dashed average lines per series. */
export function GroupChart({ cats, series, avgLines }: { cats: string[]; series: Series[]; avgLines?: boolean }) {
  if (!cats.length) return null
  const W = 560, H = 176, L = 32, R = avgLines ? 44 : 10, T = 14, B = 46
  const iw = W - L - R, ih = H - T - B, n = series.length
  const avgs = avgLines
    ? series.map((s) => {
        const v = s.vals.filter((x): x is number => x != null)
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
      })
    : []
  const vals = series.flatMap((s) => s.vals).filter((v): v is number => v != null)
  const max = Math.max(1, ...vals, ...avgs.filter((v): v is number => v != null)) * 1.18
  const step = iw / cats.length
  const gw = Math.min(step * 0.82, n * 30)
  const bw = gw / n
  const y = (v: number) => T + ih - (v / max) * ih

  const lw = series.map((s) => 13 + s.name.length * 6.2 + 16)
  const tw = lw.reduce((a, b) => a + b, 0) - 16
  const legendX = lw.map((_, j) => (W - tw) / 2 + lw.slice(0, j).reduce((a, b) => a + b, 0))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grouped bar chart">
      {[0, 0.5, 1].map((f) => {
        const v = (max / 1.15) * f
        return (
          <g key={f}>
            <line className="gl" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end">{Math.round(v)}</text>
          </g>
        )
      })}
      <text x={L - 6} y={T - 2} textAnchor="end">SP</text>
      {avgLines && series.map((s, j) => {
        const v = avgs[j]
        if (v == null) return null
        return (
          <g key={s.name}>
            <line className={`${s.cls} avgl`} x1={L} x2={W - R} y1={y(v)} y2={y(v)}><title>{`${s.name} average: ${n2(v)}`}</title></line>
            <text className={`${s.cls} avgt`} x={W - R + 4} y={y(v) + 3.5}>{n2(v)}</text>
          </g>
        )
      })}
      {cats.map((c, k) => {
        const x0 = L + step * k + (step - gw) / 2
        return (
          <g key={k}>
            {series.map((s, j) => {
              const v = s.vals[k]
              if (v == null) return null
              const x = x0 + bw * j
              const top = y(v)
              return (
                <g key={s.name}>
                  <rect className={s.cls} x={x + 1} y={top} width={Math.max(2, bw - 2)} height={Math.max(0, T + ih - top)} rx={3}><title>{`${s.name}: ${n2(v)}`}</title></rect>
                  {bw >= 18 && <text className="val sm" x={x + bw / 2} y={top - 3} textAnchor="middle">{n2(v)}</text>}
                </g>
              )
            })}
            <text x={L + step * k + step / 2} y={T + ih + 16} textAnchor="middle">{c.length > 12 ? c.slice(0, 11) + '…' : c}</text>
          </g>
        )
      })}
      {series.map((s, j) => (
        <g key={s.name}>
          <rect className={s.cls} x={legendX[j]} y={H - 13} width={9} height={9} rx={2} />
          <text x={legendX[j] + 13} y={H - 5}>{s.name}</text>
        </g>
      ))}
    </svg>
  )
}

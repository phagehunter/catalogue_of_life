import { formatCount } from '../data/labels.js'

// Horizontal bars for a sorted list of {label, value, sub}. Values are
// compared to the maximum; one series, so a single accent colour is right.
export default function BarChart({ rows, valueLabel = '' }) {
  if (!rows?.length) return null
  const max = Math.max(...rows.map(r => r.value))
  return (
    <div className="bars" role="table" aria-label={valueLabel}>
      {rows.map(r => (
        <div className="bar-row" role="row" key={r.label}>
          <span className="label" role="rowheader" title={r.sub || r.label}>{r.label}</span>
          <span className="track" aria-hidden="true"><span className="fill" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="num" role="cell">{formatCount(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

import { STATUS_LABEL, STATUS_HELP, rankLabel } from '../data/labels.js'

export function RankPill({ rank }) {
  if (!rank || rank === 'unranked') return null
  return <span className="pill rank">{rankLabel(rank)}</span>
}

export function StatusPill({ status }) {
  if (!status || status === 'accepted') return null
  const key = status.split(' ')[0].replace('provisionally', 'provisional')
  return <span className={`pill status-${key}`} title={STATUS_HELP[status]}>{STATUS_LABEL[status] || status}</span>
}

export function ExtinctPill({ extinct }) {
  return extinct ? <span className="pill extinct" title="Marked extinct in the source dataset">Extinct</span> : null
}

export function XrPill({ show }) {
  return show ? <span className="pill xr" title="Added by the Catalogue of Life eXtended Release (not yet in the expert-curated base release)">XR</span> : null
}

export function BinPill({ show }) {
  return show ? <span className="pill" title="BOLD Barcode Index Number: a DNA-barcode cluster, not a formally described taxon">DNA barcode cluster</span> : null
}

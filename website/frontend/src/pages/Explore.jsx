import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getChildren, getChildrenPage } from '../data/api.js'
import { useMeta } from '../components/MetaContext.jsx'
import useTitle from '../components/useTitle.js'
import { ChevronIcon } from '../components/Icons.jsx'
import { ExtinctPill, BinPill, StatusPill } from '../components/Pills.jsx'
import { formatCount, isItalicRank, rankLabel } from '../data/labels.js'

export default function Explore() {
  useTitle('Explore the tree of life', 'Open the tree of life branch by branch, from domains to species.')
  const meta = useMeta()
  const [showBins, setShowBins] = useState(false)
  return (
    <div className="page">
      <h1>Explore the tree of life</h1>
      <p className="muted">Open a branch to list the accepted taxa it contains. Names link to the full record with synonyms, common names and distribution.</p>
      <div className="toolbar">
        <label><input type="checkbox" checked={showBins} onChange={e => setShowBins(e.target.checked)} /> Show DNA barcode clusters (BOLD BINs)</label>
      </div>
      <ul className="tree">
        {meta.roots.map(r => (
          <TreeNode key={r.i} node={{ i: r.i, n: r.n, rank: meta.ranks[r.r], counts: { children: r.nc || 0 } }} showBins={showBins} depth={0} />
        ))}
      </ul>
    </div>
  )
}

function TreeNode({ node, showBins, depth }) {
  const meta = useMeta()
  const [open, setOpen] = useState(false)
  const [kids, setKids] = useState(null)
  const [pages, setPages] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const total = node.counts?.children || 0
  const pageSize = meta.shards.kidsPage

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && kids === null) {
      setBusy(true)
      try {
        const k = await getChildren(node.i)
        setKids(k.children)
      } catch (e) { setError(e.message) } finally { setBusy(false) }
    }
  }
  async function more() {
    setBusy(true)
    try {
      const page = await getChildrenPage(node.i, 'c', pages + 1)
      setKids(k => [...k, ...page])
      setPages(p => p + 1)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const visible = (kids || []).filter(k => showBins || !k.isBin)
  const hiddenBins = (kids || []).length - visible.length
  const italic = isItalicRank(node.rank, meta.ranks) && !node.isBin
  return (
    <li>
      <div className="tree-row">
        <button type="button" className={'tree-toggle' + (total ? '' : ' leaf')} aria-expanded={open} aria-label={open ? `Collapse ${node.n}` : `Expand ${node.n}`} onClick={toggle} disabled={!total}>
          <ChevronIcon />
        </button>
        <Link to={`/taxon/${encodeURIComponent(node.i)}`} className={italic ? 'sci' : ''}>{node.n}</Link>
        {node.rank && node.rank !== 'unranked' ? <span className="rank">{rankLabel(node.rank)}</span> : null}
        <StatusPill status={node.status} />
        <ExtinctPill extinct={node.extinct} />
        <BinPill show={node.isBin} />
        {total ? <span className="n">{formatCount(total)}</span> : null}
      </div>
      {open ? (
        <ul>
          {error ? <li className="notice error small">{error}</li> : null}
          {visible.map(k => <TreeNode key={k.i} node={k} showBins={showBins} depth={depth + 1} />)}
          {busy ? <li className="tree-row muted small">Loading…</li> : null}
          {!busy && kids && kids.length < total && kids.length >= pageSize * pages ? (
            <li className="tree-more"><button type="button" className="btn sm" onClick={more}>Show more ({formatCount(total - kids.length)} remaining)</button></li>
          ) : null}
          {!busy && hiddenBins ? <li className="tree-row muted small">{formatCount(hiddenBins)} DNA barcode clusters hidden</li> : null}
          {!busy && kids && kids.length === 0 ? <li className="tree-row muted small">No accepted children in the dataset.</li> : null}
        </ul>
      ) : null}
    </li>
  )
}

export default function Skeleton({ lines = 4, label = 'Loading' }) {
  const widths = ['tall', 'w70', '', 'w40', '', 'w70']
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => <span key={i} className={'line ' + widths[i % widths.length]} />)}
    </div>
  )
}

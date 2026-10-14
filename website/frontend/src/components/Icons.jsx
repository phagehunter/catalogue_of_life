const base = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const SearchIcon = (p) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)
export const ChevronIcon = (p) => (
  <svg {...base} {...p}><path d="m9 6 6 6-6 6" /></svg>
)
export const SunIcon = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
)
export const MoonIcon = (p) => (
  <svg {...base} {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
)
export const TreeIcon = (p) => (
  <svg {...base} {...p}><path d="M12 3v6M12 9c-4 0-7 2-7 6M12 9c4 0 7 2 7 6M5 15v3M19 15v3M12 9v12" /></svg>
)
export const CompareIcon = (p) => (
  <svg {...base} {...p}><path d="M4 6h5l3 6 3-6h5M4 18h5l3-6 3 6h5" /></svg>
)
export const BookIcon = (p) => (
  <svg {...base} {...p}><path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4ZM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7Z" /></svg>
)
export const LeafMark = (p) => (
  <svg viewBox="0 0 32 32" aria-hidden="true" {...p}>
    <path d="M27 5C15 5 6 12 5 25c7-2 13-4 17-9-4 7-9 9-14 11 10 1 19-6 19-22Z" fill="currentColor" />
  </svg>
)

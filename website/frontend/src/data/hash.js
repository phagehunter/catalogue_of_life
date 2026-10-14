// Mirrors scripts/process_data.py exactly: djb2 over UTF-16 code units and
// the search-key normaliser. tests/test_process_data.py checks parity.

export function djb2(text) {
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  }
  return h
}

export function shardFor(id, shards) {
  if (!id) return 0
  return djb2(id) % shards
}

// Lowercase, strip diacritics, keep letters/digits/space/hyphen, collapse spaces.
export function normalise(text) {
  if (!text) return ''
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^0-9a-zÀ-￿\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Prefix → file stem, same rule as prefix_filename() in Python.
export function prefixFilename(prefix) {
  let out = ''
  for (const ch of prefix) {
    if (/^[0-9a-z]$/i.test(ch)) out += ch
    else if (ch === ' ') out += '_'
    else if (ch === '-') out += '-'
    else out += 'u' + ch.codePointAt(0).toString(16).padStart(4, '0')
  }
  return out
}

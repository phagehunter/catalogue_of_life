// Human labels for codes emitted by the processor.

export const STATUS_LABEL = {
  'accepted': 'Accepted name',
  'provisionally accepted': 'Provisionally accepted',
  'synonym': 'Synonym',
  'ambiguous synonym': 'Ambiguous synonym',
  'misapplied': 'Misapplied name',
  'bare name': 'Bare name',
}

export const STATUS_HELP = {
  'accepted': 'The name currently used for this taxon.',
  'provisionally accepted': 'Treated as accepted, but the source has not fully verified it.',
  'synonym': 'A different name for a taxon that has an accepted name.',
  'ambiguous synonym': 'A synonym that has been applied to more than one taxon.',
  'misapplied': 'A name that was used in error for this taxon.',
  'bare name': 'A published name with no taxonomic placement.',
}

export const SEARCH_KIND = ['accepted', 'vernacular', 'provisional', 'synonym', 'token']

// ISO 639-3 → English language name for the codes that dominate the data.
export const LANGUAGE = {
  eng: 'English', fra: 'French', deu: 'German', spa: 'Spanish', por: 'Portuguese',
  ita: 'Italian', nld: 'Dutch', swe: 'Swedish', nor: 'Norwegian', dan: 'Danish',
  fin: 'Finnish', rus: 'Russian', pol: 'Polish', ces: 'Czech', slk: 'Slovak',
  hun: 'Hungarian', ron: 'Romanian', bul: 'Bulgarian', ell: 'Greek', tur: 'Turkish',
  heb: 'Hebrew', ara: 'Arabic', fas: 'Persian', hin: 'Hindi', ben: 'Bengali',
  urd: 'Urdu', tam: 'Tamil', tel: 'Telugu', mal: 'Malayalam', kan: 'Kannada',
  mar: 'Marathi', guj: 'Gujarati', nep: 'Nepali', sin: 'Sinhala', tha: 'Thai',
  vie: 'Vietnamese', khm: 'Khmer', lao: 'Lao', mya: 'Burmese', msa: 'Malay',
  ind: 'Indonesian', tgl: 'Tagalog', jpn: 'Japanese', zho: 'Chinese', kor: 'Korean',
  cmn: 'Mandarin', yue: 'Cantonese', amh: 'Amharic', swa: 'Swahili', hau: 'Hausa',
  yor: 'Yoruba', ibo: 'Igbo', zul: 'Zulu', xho: 'Xhosa', afr: 'Afrikaans',
  som: 'Somali', mlg: 'Malagasy', cat: 'Catalan', eus: 'Basque', glg: 'Galician',
  gle: 'Irish', cym: 'Welsh', gla: 'Scottish Gaelic', bre: 'Breton', isl: 'Icelandic',
  est: 'Estonian', lav: 'Latvian', lit: 'Lithuanian', ukr: 'Ukrainian', bel: 'Belarusian',
  srp: 'Serbian', hrv: 'Croatian', slv: 'Slovenian', bos: 'Bosnian', mkd: 'Macedonian',
  sqi: 'Albanian', kat: 'Georgian', hye: 'Armenian', aze: 'Azerbaijani', kaz: 'Kazakh',
  uzb: 'Uzbek', mon: 'Mongolian', lat: 'Latin', epo: 'Esperanto', haw: 'Hawaiian',
  mri: 'Māori', smo: 'Samoan', ton: 'Tongan', fij: 'Fijian', grn: 'Guarani',
  que: 'Quechua', aym: 'Aymara', nah: 'Nahuatl', kal: 'Greenlandic', iku: 'Inuktitut',
  crp: 'Creole', zxx: 'No language', csb: 'Kashubian', ltz: 'Luxembourgish', fao: 'Faroese',
  oci: 'Occitan', fry: 'Frisian', nno: 'Norwegian Nynorsk', nob: 'Norwegian Bokmål', sme: 'Northern Sami',
  mlt: 'Maltese', bod: 'Tibetan', uig: 'Uyghur', pus: 'Pashto', kur: 'Kurdish', san: 'Sanskrit',
  pan: 'Punjabi', ori: 'Odia', asm: 'Assamese', jav: 'Javanese', sun: 'Sundanese', ceb: 'Cebuano',
  ilo: 'Ilocano', hil: 'Hiligaynon', war: 'Waray', bik: 'Bikol', pam: 'Kapampangan', tpi: 'Tok Pisin',
  fil: 'Filipino', tet: 'Tetum', wol: 'Wolof', lin: 'Lingala', kin: 'Kinyarwanda', lug: 'Luganda',
  sna: 'Shona', nya: 'Chichewa', tsn: 'Tswana', sot: 'Sotho', ssw: 'Swazi', ven: 'Venda', tso: 'Tsonga',
  nbl: 'Ndebele', orm: 'Oromo', tir: 'Tigrinya', kon: 'Kongo', ewe: 'Ewe', aka: 'Akan', twi: 'Twi',
  fon: 'Fon', bam: 'Bambara', ful: 'Fula', nav: 'Navajo', chr: 'Cherokee', cre: 'Cree', oji: 'Ojibwe',
  lkt: 'Lakota', dak: 'Dakota', yid: 'Yiddish', lad: 'Ladino', rom: 'Romani',
}

export function languageName(code) {
  if (!code) return 'Unspecified language'
  return LANGUAGE[code] || code.toUpperCase()
}

// Ranks at or below genus are written in italics by convention.
const ITALIC_FROM = 'genus'
export function isItalicRank(rankName, ranks) {
  if (!rankName) return false
  const i = ranks.indexOf(rankName)
  const g = ranks.indexOf(ITALIC_FROM)
  return i >= g && !['unranked', 'other', 'species aggregate', 'cultivar', 'cultivar group', 'strain'].includes(rankName)
}

export function rankLabel(rankName) {
  if (!rankName || rankName === 'unranked') return 'Unranked'
  return rankName.charAt(0).toUpperCase() + rankName.slice(1)
}

export function formatCount(n) {
  return (n || 0).toLocaleString('en-US')
}

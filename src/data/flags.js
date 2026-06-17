// Map of country name (as it appears in openfootball data) to ISO 3166-1
// alpha-2 code, used to render local flag images and emoji fallbacks.
const NAME_TO_ISO = {
  Afghanistan: 'af', Albania: 'al', Algeria: 'dz', Angola: 'ao',
  Argentina: 'ar', Australia: 'au', Austria: 'at', Belgium: 'be',
  Bolivia: 'bo', Bosnia: 'ba', 'Bosnia & Herzegovina': 'ba',
  'Bosnia and Herzegovina': 'ba', Brazil: 'br',
  'Burkina Faso': 'bf', Cameroon: 'cm', Canada: 'ca', 'Cape Verde': 'cv',
  Chile: 'cl', China: 'cn', 'China PR': 'cn', Colombia: 'co',
  'Congo DR': 'cd', 'DR Congo': 'cd', Congo: 'cg', 'Costa Rica': 'cr',
  Croatia: 'hr', Curacao: 'cw', 'Cura\u00e7ao': 'cw', Czechia: 'cz',
  'Czech Republic': 'cz', Denmark: 'dk', Ecuador: 'ec', Egypt: 'eg',
  England: 'gb-eng', 'El Salvador': 'sv', France: 'fr', Gabon: 'ga',
  Germany: 'de', Ghana: 'gh', Greece: 'gr', Guatemala: 'gt',
  Haiti: 'ht', Honduras: 'hn', Hungary: 'hu', Iceland: 'is',
  Iran: 'ir', 'IR Iran': 'ir', Iraq: 'iq', Italy: 'it',
  'Ivory Coast': 'ci', "Cote d'Ivoire": 'ci', "C\u00f4te d'Ivoire": 'ci',
  Jamaica: 'jm', Japan: 'jp', Jordan: 'jo', Kenya: 'ke',
  'Korea Republic': 'kr', 'South Korea': 'kr', Kuwait: 'kw', Mali: 'ml',
  Mexico: 'mx', Morocco: 'ma', Mozambique: 'mz', Netherlands: 'nl',
  'New Zealand': 'nz', Nigeria: 'ng', 'North Macedonia': 'mk',
  Norway: 'no', Oman: 'om', Panama: 'pa', Paraguay: 'py', Peru: 'pe',
  Poland: 'pl', Portugal: 'pt', Qatar: 'qa', 'Republic of Ireland': 'ie',
  Ireland: 'ie', Romania: 'ro', Russia: 'ru', 'Saudi Arabia': 'sa',
  Scotland: 'gb-sct', Senegal: 'sn', Serbia: 'rs', Slovakia: 'sk',
  Slovenia: 'si', 'South Africa': 'za', Spain: 'es', Sweden: 'se',
  Switzerland: 'ch', Togo: 'tg', Tunisia: 'tn', Turkey: 'tr',
  Turkiye: 'tr', 'T\u00fcrkiye': 'tr', Uganda: 'ug', Ukraine: 'ua',
  'United States': 'us', USA: 'us', Uruguay: 'uy', Uzbekistan: 'uz',
  Venezuela: 've', Wales: 'gb-wls', Zambia: 'zm',
}

function normalizeName(name) {
  return name
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+/g, ' ')
}

const NORMALIZED_NAME_TO_ISO = Object.fromEntries(
  Object.entries(NAME_TO_ISO).map(([name, iso]) => [normalizeName(name).toLowerCase(), iso]),
)

// Convert an ISO alpha-2 code into a flag emoji using regional indicators.
// Subdivision codes (gb-eng etc.) have no emoji, so those return null and the
// UI uses flagcdn instead.
function isoToEmoji(iso) {
  if (!iso || iso.includes('-')) return null
  return iso
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

export function isoFor(name) {
  if (!name) return null
  const trimmed = name.trim()
  return NAME_TO_ISO[trimmed] || NORMALIZED_NAME_TO_ISO[normalizeName(trimmed).toLowerCase()] || null
}

export function flagEmoji(name) {
  return isoToEmoji(isoFor(name))
}

// Local PNGs live in public/flags and are copied into the build output by Vite.
export function flagImgUrl(name, width = 80) {
  const iso = isoFor(name)
  if (!iso) return null
  return `/flags/${iso}.png`
}

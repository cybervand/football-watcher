// =============================================================================
// LIVE SCORES — NIFS API
// -----------------------------------------------------------------------------
// Free, key-less, CORS-open football API (the same feed behind NRK's
// resultater.nrk.no, via NTB / Norkon Live Center). It returns
// `Access-Control-Allow-Origin: *`, so the browser can call it directly — no
// API key, no signed header, no proxy.
//
// We use it as the live SCORE + STATUS source. The fixture list and knockout
// bracket topology still come from openfootball (see worldcup.js); NIFS results
// are overlaid onto those fixtures by team pair.
//
// Endpoint:  https://v3api.nifs.no/matches/?date=YYYY-MM-DD   (all matches that
//            day, every tournament). We filter to the World Cup via
//            stage.tournament.id === WC_TOURNAMENT_ID.
// =============================================================================

const NIFS_BASE = 'https://v3api.nifs.no'
const WC_TOURNAMENT_ID = 56 // FIFA Fotball-VM 2026 ("VM")

// NIFS reports team names in Norwegian; the app's bracket uses English. Map the
// names that differ. Anything not listed is assumed identical (Argentina,
// England, Japan, Senegal, USA, ...). Keys are lowercased for lookup.
const TEAM_ALIASES = {
  algerie: 'Algeria',
  belgia: 'Belgium',
  'bosnia-hercegovina': 'Bosnia & Herzegovina',
  brasil: 'Brazil',
  curacao: 'Curaçao',
  'dr kongo': 'DR Congo',
  egypt: 'Egypt',
  elfenbenskysten: 'Ivory Coast',
  frankrike: 'France',
  irak: 'Iraq',
  'kapp verde': 'Cape Verde',
  kroatia: 'Croatia',
  marokko: 'Morocco',
  nederland: 'Netherlands',
  norge: 'Norway',
  'saudi-arabia': 'Saudi Arabia',
  skottland: 'Scotland',
  spania: 'Spain',
  sveits: 'Switzerland',
  sverige: 'Sweden',
  'sør-afrika': 'South Africa',
  'sør-korea': 'South Korea',
  tsjekkia: 'Czech Republic',
  tyrkia: 'Turkey',
  tyskland: 'Germany',
  usbekistan: 'Uzbekistan',
  'østerrike': 'Austria',
}

// NIFS matchStatusId enum (from the API's own /matches/?help=1):
//   1 = Played, 2 = Not started, 3 = Postponed, 4 = Abandoned,
//   5 = Will not be played, 6 = Date not set, 7..15,18..31 = in-play phases
//   (first/second half, half time, extra time, penalty shootout, pauses),
//   16 = Played but cancelled, 17 = Played but not counting in statistics.
const FINISHED_STATUS = new Set([1, 16, 17])
const SCHEDULED_STATUS = new Set([2, 6])
// In-play covers every "ongoing" phase, including half time / pauses, since the
// match is underway and the score is live.
function isLiveStatus(id) {
  return id === 7 || (id >= 8 && id <= 15) || (id >= 18 && id <= 31)
}

function englishTeam(nifsName) {
  if (!nifsName) return null
  return TEAM_ALIASES[nifsName.toLowerCase()] || nifsName
}

// Stable, order-independent key for a fixture: the two team names sorted.
// Lets us match a NIFS match to an openfootball fixture regardless of which
// side is "home", which can differ between the two sources.
export function teamPairKey(a, b) {
  if (!a || !b) return null
  return [a, b].map((t) => t.toLowerCase().trim()).sort().join('::')
}

function statusFromId(id) {
  if (FINISHED_STATUS.has(id)) return 'finished'
  if (isLiveStatus(id)) return 'live'
  if (SCHEDULED_STATUS.has(id)) return 'scheduled'
  return null // postponed/abandoned/etc — leave the app's own status alone
}

// The bulk by-date endpoint is CACHED and can lag badly. Use it only to
// discover which WC matches exist today and their IDs.
async function fetchDate(date) {
  const res = await fetch(`${NIFS_BASE}/matches/?date=${date}&inCustomerStages=1`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`NIFS HTTP ${res.status}`)
  return res.json()
}

// The per-match endpoint (TRAILING SLASH REQUIRED) is the FRESH one NRK polls.
// Returns the live score/status for a single match. Returns null on any failure.
async function fetchMatch(matchId) {
  try {
    const res = await fetch(`${NIFS_BASE}/matches/${matchId}/`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? data[0] : data
  } catch {
    return null
  }
}

// First day of the tournament. We fetch every date from here through tomorrow so
// EVERY played match gets its NIFS id (and thus its recap), not just the last
// few days — otherwise older matches (e.g. Belgium v Egypt on matchday 5) have
// no nifsId and fall back to a Wikipedia summary even though NIFS has a recap.
const WC_START = '2026-06-11'

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Build YYYY-MM-DD strings from the tournament start through tomorrow (the +1
// covers kickoffs that straddle midnight; NIFS timestamps are +02:00). Capped so
// a misconfigured clock can't request an unbounded list.
function dateWindow(now) {
  const end = new Date(now.getTime() + 86_400_000) // tomorrow
  const start = new Date(`${WC_START}T00:00:00Z`)
  const out = []
  for (let d = new Date(start); d <= end && out.length < 60; d = new Date(d.getTime() + 86_400_000)) {
    out.push(ymd(d))
  }
  // If "now" is somehow before the tournament, still return a small window.
  return out.length ? out : [ymd(now)]
}

// Turn one NIFS match object into a [pairKey, entry] tuple, or null if it isn't
// a usable WC match. `entry.score` is oriented to teamPairKey's sort order so
// the overlay is side-agnostic.
function toEntry(m) {
  const stage = m.stage || {}
  if (stage.tournament?.id !== WC_TOURNAMENT_ID) return null

  const home = englishTeam(m.homeTeam?.name)
  const away = englishTeam(m.awayTeam?.name)
  const key = teamPairKey(home, away)
  if (!key) return null

  const status = statusFromId(m.matchStatusId)
  const result = m.result || {}
  const hs = result.homeScore90
  const as = result.awayScore90
  const hasScore = Number.isInteger(hs) && Number.isInteger(as)

  let score = null
  if (hasScore) {
    const homeFirst = home.toLowerCase().trim() <= away.toLowerCase().trim()
    score = homeFirst ? [hs, as] : [as, hs]
  }

  return [key, { id: m.id, score, status, scoreFinal: status === 'finished' }]
}

/**
 * Fetch current World Cup scores from NIFS.
 *
 * Two-step, because the bulk by-date endpoint is cached and lags: (1) list
 * today's WC matches from the date endpoint to learn IDs + an initial score,
 * then (2) re-fetch the FRESH per-match endpoint for any match that's in play,
 * overwriting the stale bulk value. The per-match call is what keeps a live
 * score current (the by-date one showed 1-0 while the match was really 3-1).
 *
 * Returns a Map keyed by teamPairKey -> { score, status, scoreFinal }.
 * Returns an empty Map on total failure — callers keep their existing values.
 */
export async function fetchLiveScores(now = new Date()) {
  const byPair = new Map()
  const days = dateWindow(now)
  const results = await Promise.allSettled(days.map(fetchDate))

  // Step 1: seed from the (possibly stale) bulk date listing.
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const m of r.value) {
      const entry = toEntry(m)
      if (entry) byPair.set(entry[0], entry[1])
    }
  }

  // Step 2: for every in-play match, re-fetch the fresh per-match endpoint and
  // overwrite the stale value. Only live matches need this, so it's a small
  // number of extra requests (usually 0–4).
  const liveIds = [...byPair.values()].filter((v) => v.status === 'live' && v.id).map((v) => v.id)
  const fresh = await Promise.allSettled(liveIds.map(fetchMatch))
  for (const r of fresh) {
    if (r.status !== 'fulfilled' || !r.value) continue
    const entry = toEntry(r.value)
    if (entry) byPair.set(entry[0], entry[1])
  }

  return byPair
}

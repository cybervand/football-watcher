// =============================================================================
// MATCH SUMMARY
// -----------------------------------------------------------------------------
// Builds a readable English recap of a finished match from the NIFS feed (the
// same source behind NRK). NIFS carries:
//   - matchEvents[].comment: Norwegian play-by-play + pre/post-match analysis.
//     Entries with time === null are the editorial wrap-up paragraphs (incl.
//     team background and the full-time summary). Entries with matchEventTypeId
//     === 2 are goals.
// We pick the goal moments + the closing summary, then translate NO -> EN via
// MyMemory (free, no key, CORS-open). All sources are browser-fetchable.
// =============================================================================

import { summaryKey, getCachedSummary, putCachedSummary } from './summaryCache.js'

const NIFS_BASE = 'https://v3api.nifs.no'
const GOAL_EVENT = 2 // matchEventTypeId for a goal

// MyMemory returns HTML entities (&#39; &quot; &amp;) in translated text; decode
// the common ones so the recap reads as plain prose.
function decodeEntities(text) {
  return (text || '')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function clean(text) {
  return decodeEntities(text || '').replace(/\s+/g, ' ').trim()
}

// --- Translation (Norwegian -> English) -------------------------------------
// Runs on OUR server (POST /api/translate) using the local opus-mt model, so
// users download nothing and there's no external service / quota. We batch all
// the texts for a match into one request. Falls back to the Norwegian original
// only if the server is unreachable.

async function translateBatch(texts) {
  const inputs = texts.map(clean)
  if (!inputs.some(Boolean)) return inputs
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: inputs }),
    })
    if (!res.ok) throw new Error(`translate HTTP ${res.status}`)
    const data = await res.json()
    const out = Array.isArray(data.translations) ? data.translations : []
    // Map results back, falling back to the original where a slot is missing.
    return inputs.map((orig, i) => clean(out[i]) || orig)
  } catch {
    return inputs // server unreachable — show the Norwegian original
  }
}

async function fetchNifsMatch(matchId) {
  const res = await fetch(`${NIFS_BASE}/matches/${matchId}/`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`NIFS HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data[0] : data
}

// Wikipedia one-paragraph summary for a national team (English, no translation
// needed). Used as the "how good are they / how far have they come" fallback
// when the match has no NIFS recap text.
async function teamContext(team) {
  if (!team) return null
  const page = `${team.replace(/ /g, '_')}_national_football_team`
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`)
    if (!res.ok) return null
    const data = await res.json()
    return clean(data.extract) || null
  } catch {
    return null
  }
}

/**
 * Build a summary for a finished match, using the IndexedDB cache. On a cache
 * hit it returns instantly (no NIFS fetch, no translation). On a miss it builds
 * fresh and persists the result IF it's a real NIFS recap — so once a summary
 * "comes in" we always have it, even offline or if NIFS later drops the match.
 * Fallback (Wikipedia-only) summaries are not cached, so they retry until a real
 * recap exists.
 * @param {{ nifsId?: number, team1: string, team2: string, score?: [number,number] }} match
 * @returns {Promise<{ recap: string|null, goals: string[], context: string[]|null, source: string, cached?: boolean }>}
 */
export async function buildMatchSummary(match) {
  const key = summaryKey(match)
  const cached = await getCachedSummary(key)
  // Use the cache only if it's the newer shape that includes the original
  // Norwegian (recapNo) for the EN/NO toggle. Older cached entries lack it, so
  // we rebuild them once to capture both languages.
  if (cached && (cached.recapNo || cached.goalsNo)) return { ...cached, cached: true }

  const data = await buildSummaryFresh(match)

  // Persist only finished NIFS recaps — those are final and won't change.
  // (A fallback/no-recap result may improve later, so don't lock it in.)
  if (data.source === 'nifs' && (data.recap || data.goals?.length)) {
    await putCachedSummary(key, data)
  }
  return data
}

/** Build a summary from scratch (NIFS + translation, or Wikipedia fallback). */
async function buildSummaryFresh(match) {
  // No NIFS id (e.g. a knockout placeholder, or live data unavailable): fall
  // back to team context from Wikipedia.
  if (!match?.nifsId) {
    const [a, b] = await Promise.all([teamContext(match?.team1), teamContext(match?.team2)])
    const context = [a, b].filter(Boolean)
    return { recap: null, goals: [], context: context.length ? context : null, source: 'wikipedia' }
  }

  let nifs
  try {
    nifs = await fetchNifsMatch(match.nifsId)
  } catch {
    nifs = null
  }
  const events = nifs?.matchEvents
  const usable = Array.isArray(events) ? events.filter((e) => typeof e?.comment === 'string') : []

  // Goal moments, in order.
  const goalLines = usable
    .filter((e) => e.matchEventTypeId === GOAL_EVENT && clean(e.comment))
    .map((e) => clean(e.comment))

  // The closing summary is the LAST wrap-up paragraph (time === null) — that's
  // the full-time recap ("France win 3-1 after a stunning second half...").
  const wrapups = usable.filter((e) => e.time === null && clean(e.comment).length > 60)
  const recapNo = wrapups.length ? clean(wrapups[wrapups.length - 1].comment) : ''

  if (!recapNo && !goalLines.length) {
    // No recap text at all — fall back to team context.
    const [a, b] = await Promise.all([teamContext(match.team1), teamContext(match.team2)])
    const context = [a, b].filter(Boolean)
    return { recap: null, goals: [], context: context.length ? context : null, source: 'wikipedia' }
  }

  // One batched request to the server translates the recap + all goal lines.
  const toTranslate = [recapNo || '', ...goalLines]
  const translated = await translateBatch(toTranslate)
  const recap = recapNo ? translated[0] : null
  const goals = translated.slice(1).filter(Boolean)

  // Keep the ORIGINAL Norwegian too, so the summary modal can offer an EN/NO
  // toggle without re-fetching or re-translating. `*No` fields mirror the
  // English ones.
  return {
    recap,
    goals,
    recapNo: recapNo || null,
    goalsNo: goalLines,
    context: null,
    source: 'nifs',
  }
}

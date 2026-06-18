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
  // Reuse cache if it has the Norwegian original (newer shape). The cached entry
  // may also already carry an English translation from a previous request.
  if (cached && (cached.recapNo || cached.goalsNo)) return { ...cached, cached: true }

  const data = await buildSummaryFresh(match)

  // Cache the Norwegian recap immediately (it's final). English gets added to
  // the same cache entry later by translateSummary().
  if (data.source === 'nifs' && (data.recapNo || data.goalsNo?.length)) {
    await putCachedSummary(key, data)
  }
  return data
}

/**
 * Translate an already-built NIFS summary's Norwegian text to English, lazily.
 * Returns { recap, goals } in English. Caches the result onto the summary's
 * cache entry so a match is only ever translated once. Call this when the user
 * switches to English.
 */
export async function translateSummary(match, data) {
  // Already translated (in memory or from cache)? Return as-is.
  if (data?.recap || data?.goals?.length) return { recap: data.recap, goals: data.goals }

  const toTranslate = [data?.recapNo || '', ...(data?.goalsNo || [])]
  if (!toTranslate.some(Boolean)) return { recap: null, goals: [] }

  const translated = await translateBatch(toTranslate)
  const recap = data?.recapNo ? translated[0] : null
  const goals = translated.slice(1).filter(Boolean)

  // Persist the English alongside the Norwegian so next time it's instant.
  const key = summaryKey(match)
  const merged = { ...data, recap, goals }
  if (data?.source === 'nifs') await putCachedSummary(key, merged)
  return { recap, goals }
}

/**
 * Like translateSummary, but STREAMS: calls onProgress({recap, goals}) as the
 * English arrives token-by-token. Falls back to the non-streaming path if the
 * stream endpoint isn't available. Resolves to the final {recap, goals} and
 * caches it. texts[0] = recap, texts[1..] = goals.
 */
export async function translateSummaryStream(match, data, onProgress) {
  if (data?.recap || data?.goals?.length) return { recap: data.recap, goals: data.goals }
  const texts = [data?.recapNo || '', ...(data?.goalsNo || [])]
  if (!texts.some(Boolean)) return { recap: null, goals: [] }

  let res
  try {
    res = await fetch('/api/translate/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    })
    if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`)
  } catch {
    // No stream support — fall back to the batch translate.
    return translateSummary(match, data)
  }

  const parts = texts.map(() => '')
  const fromParts = () => ({
    recap: data?.recapNo ? clean(parts[0]) || null : null,
    goals: parts.slice(1).map(clean).filter(Boolean),
  })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let final = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      let evt
      try { evt = JSON.parse(line) } catch { continue }
      if (evt.done) {
        if (Array.isArray(evt.translations)) {
          evt.translations.forEach((t, i) => { parts[i] = t })
        }
        final = fromParts()
      } else if (typeof evt.i === 'number') {
        parts[evt.i] = evt.text != null ? evt.text : (evt.partial ?? parts[evt.i])
        onProgress?.(fromParts())
      }
    }
  }
  const result = final || fromParts()
  const key = summaryKey(match)
  if (data?.source === 'nifs' && (result.recap || result.goals?.length)) {
    await putCachedSummary(key, { ...data, recap: result.recap, goals: result.goals })
  }
  return result
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

  // NORWEGIAN-FIRST: return the original Norwegian immediately, NO translation.
  // English is produced lazily (and cached) only when the user asks for it via
  // translateSummary(). This makes the recap appear instantly and only runs the
  // (slow) translator on demand.
  return {
    recap: null,         // English not produced yet
    goals: [],
    recapNo: recapNo || null,
    goalsNo: goalLines,
    context: null,
    source: 'nifs',
  }
}

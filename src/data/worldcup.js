import fallback from './fallback.js'

// =============================================================================
// DATA SOURCE
// -----------------------------------------------------------------------------
// Primary source: openfootball/worldcup.json — public domain, no API key.
// In dev, vite proxies /wc-data -> raw.githubusercontent.com (see vite.config).
// In prod, we hit the raw URL directly.
//
// >>> TO GO FULLY LIVE WITH A REAL-TIME API <<<
// Replace the body of fetchRawData() with a call to your provider
// (football-data.org, API-Football, Sportmonks, etc.) and map its response
// into the { name, matches:[{round,group,date,time,team1,team2,score:{ft}}] }
// shape that normalizeMatches() expects. Nothing else needs to change.
// =============================================================================

const IS_DEV = import.meta.env?.DEV ?? false

const LIVE_URL = IS_DEV
  ? '/wc-data/2026/worldcup.json'
  : 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'

async function fetchRawData() {
  const res = await fetch(LIVE_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Returns { data, source } where source is 'live' or 'fallback'. */
export async function loadWorldCup() {
  try {
    const data = await fetchRawData()
    if (!data?.matches?.length) throw new Error('empty payload')
    return { data, source: 'live' }
  } catch (err) {
    console.warn('[worldcup] live fetch failed, using bundled fallback:', err.message)
    return { data: fallback, source: 'fallback' }
  }
}

// =============================================================================
// NORMALIZATION
// =============================================================================

// "13:00 UTC-6" -> a Date in the user's local zone, combining date + time.
function parseKickoff(dateStr, timeStr) {
  if (!dateStr) return null
  const m = /(\d{1,2}):(\d{2})/.exec(timeStr || '')
  const hh = m ? m[1].padStart(2, '0') : '00'
  const mm = m ? m[2] : '00'
  const tz = /UTC([+-]\d{1,2})(?::?(\d{2}))?/.exec(timeStr || '')
  let offset = '+00:00'
  if (tz) {
    const sign = tz[1].startsWith('-') ? '-' : '+'
    const h = String(Math.abs(parseInt(tz[1], 10))).padStart(2, '0')
    offset = `${sign}${h}:${tz[2] || '00'}`
  }
  const iso = `${dateStr}T${hh}:${mm}:00${offset}`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

function ftScore(score) {
  const ft = score?.ft
  if (Array.isArray(ft) && ft.length === 2) return [ft[0], ft[1]]
  return null
}

// A full match runs ~90 + ~15 stoppage + 15 halftime ≈ 105–120 min. We treat
// anything past this as "should be over". The openfootball feed posts the
// full-time score on a delay, so between "kicked off" and "score appears" we
// must NOT assume live forever — once the play window has elapsed with no score
// yet, the game is over and we're just awaiting the result.
const LIVE_WINDOW_MS = 125 * 60 * 1000 // ~max realistic 90-min match length

function statusOf(match, kickoff, now) {
  // A posted full-time score is the authoritative "finished" signal.
  if (match.score && ftScore(match.score)) return 'finished'
  if (!kickoff) return 'scheduled'
  const elapsed = now - kickoff.getTime()
  if (elapsed < 0) return 'scheduled'
  if (elapsed <= LIVE_WINDOW_MS) return 'live'
  // Past the play window but no score in the feed yet: the match has ended,
  // the result just hasn't been published. Don't keep claiming it's LIVE.
  return 'awaiting'
}

/** Normalize raw matches into a stable internal shape. */
export function normalizeMatches(data, now = Date.now()) {
  return (data.matches || []).map((m, i) => {
    const kickoff = parseKickoff(m.date, m.time)
    const ft = ftScore(m.score)
    return {
      id: m.num != null ? `n${m.num}` : `m${i}`,
      num: m.num ?? null,
      round: m.round || '',
      group: (m.group || '').replace(/^Group\s+/i, '') || null,
      team1: m.team1 || null,
      team2: m.team2 || null,
      score: ft,
      scoreFinal: !!ft,
      kickoff,
      ground: m.ground || null,
      status: statusOf(m, kickoff, now),
    }
  })
}

// The winner of a finished match (by full-time score). Null if drawn/unknown.
// (Penalty shootouts aren't in the source feed; FT is the available signal.)
export function winnerOf(match) {
  if (!match?.score || match.scoreFinal === false || !match.team1 || !match.team2) return null
  const [a, b] = match.score
  if (a > b) return match.team1
  if (b > a) return match.team2
  return null
}

// =============================================================================
// GROUP STANDINGS
// =============================================================================

export const GROUP_TEAMS = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czech Republic'],
  B: ['Canada', 'Bosnia & Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['USA', 'Paraguay', 'Australia', 'Turkey'],
  E: ['Germany', 'Cura\u00e7ao', 'Ivory Coast', 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Iraq', 'Norway'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
}

function groupSeedIndex(group, team) {
  const idx = (GROUP_TEAMS[group] || []).indexOf(team)
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function blankStanding(team) {
  return { team, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 }
}

export function buildGroups(matches) {
  const groups = Object.fromEntries(
    Object.entries(GROUP_TEAMS).map(([group, teams]) => [
      group,
      Object.fromEntries(teams.map((team) => [team, blankStanding(team)])),
    ]),
  )

  for (const m of matches) {
    if (!m.group) continue
    const g = (groups[m.group] ||= {})
    for (const t of [m.team1, m.team2]) {
      if (t && !g[t]) g[t] = blankStanding(t)
    }
    if (m.score && m.scoreFinal !== false && m.team1 && m.team2) {
      const [a, b] = m.score
      const t1 = g[m.team1], t2 = g[m.team2]
      t1.P++; t2.P++
      t1.GF += a; t1.GA += b; t2.GF += b; t2.GA += a
      if (a > b) { t1.W++; t1.Pts += 3; t2.L++ }
      else if (b > a) { t2.W++; t2.Pts += 3; t1.L++ }
      else { t1.D++; t2.D++; t1.Pts++; t2.Pts++ }
    }
  }
  // Return sorted standings per group.
  const out = {}
  for (const [name, teams] of Object.entries(groups)) {
    out[name] = Object.values(teams).sort(
      (x, y) =>
        y.Pts - x.Pts ||
        (y.GF - y.GA) - (x.GF - x.GA) ||
        y.GF - x.GF ||
        groupSeedIndex(name, x.team) - groupSeedIndex(name, y.team) ||
        x.team.localeCompare(y.team),
    )
  }
  return out
}

// =============================================================================
// KNOCKOUT BRACKET (with auto-advance)
// =============================================================================

const ROUND_ORDER = [
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Final',
]

// Normalize a few alternate round spellings the source might use.
function canonRound(round) {
  const r = round.toLowerCase().replace(/[\s_-]+/g, '')
  if (r.includes('roundof32')) return 'Round of 32'
  if (r.includes('roundof16')) return 'Round of 16'
  if (r.includes('quarter')) return 'Quarter-finals'
  if (r.includes('semi')) return 'Semi-finals'
  if (r === 'final' || r === 'thefinal') return 'Final'
  return null
}

// A group is "complete" only when every one of its fixtures has a final score.
// A team's final group position (1st/2nd/3rd) isn't confirmed until then, so we
// must not resolve 1A/2B/etc to a real team before this is true — otherwise the
// bracket shows a seed-order guess as if it were decided.
function completedGroups(matches) {
  const total = {}
  const played = {}
  for (const m of matches) {
    if (!m.group) continue
    total[m.group] = (total[m.group] || 0) + 1
    if (m.score && m.scoreFinal !== false) played[m.group] = (played[m.group] || 0) + 1
  }
  const done = new Set()
  for (const g of Object.keys(total)) {
    if ((played[g] || 0) === total[g]) done.add(g)
  }
  return done
}

// `done` is the Set of group letters whose group stage is finished. Group-place
// slots (1A, 2B) resolve to a real team only when their group is in `done`;
// otherwise the placeholder is kept so nothing looks confirmed before it is.
function resolveBracketSlot(slot, groups, done) {
  if (!slot) return null

  const directPlacement = /^([123])([A-L])$/.exec(slot)
  if (directPlacement) {
    const [, place, group] = directPlacement
    if (done && !done.has(group)) return slot // group not finished — keep placeholder
    return groups[group]?.[Number(place) - 1]?.team || slot
  }

  const thirdPlacePool = /^3([A-L](?:\/[A-L])+)$/.exec(slot)
  if (thirdPlacePool) return `Best 3rd ${thirdPlacePool[1]}`

  const feeder = /^([WL])(\d+)$/.exec(slot)
  if (feeder) return `${feeder[1] === 'W' ? 'Winner' : 'Loser'} M${feeder[2]}`

  return slot
}

function isFeederSlot(slot) {
  return /^([WL])\d+$/.test(slot || '')
}

// The match number a "Wxx"/"Lxx" feeder slot points at, else null.
function feederNum(slot) {
  const m = /^[WL](\d+)$/.exec(slot || '')
  return m ? Number(m[1]) : null
}

/**
 * Build the knockout tree. Each round is an array of match slots, ORDERED BY
 * BRACKET TOPOLOGY (not by match number). The FIFA bracket is interleaved —
 * e.g. R16 match 89 (W74 vs W77) does NOT feed from the first two R32 matches —
 * so we derive each round's order by following the feeder references (Wxx) down
 * from the Final. This guarantees the two feeders of any match sit adjacent in
 * the array, which is what the layout's half-split and the auto-advance pairing
 * both rely on.
 */
export function buildBracket(matches) {
  // Index every knockout match by its bracket position number.
  const byNum = new Map()
  const byRoundNums = {}
  for (const m of matches) {
    const cr = canonRound(m.round)
    if (!cr || m.num == null) continue
    byNum.set(m.num, { ...m, round: cr, originalTeam1: m.team1, originalTeam2: m.team2 })
    ;(byRoundNums[cr] ||= []).push(m.num)
  }

  // Order the deepest present round by num as the seed, then derive every
  // earlier round's order from it: parent k's children are the two matches its
  // slots reference, kept in slot order (team1's feeder, then team2's feeder).
  const present = ROUND_ORDER.filter((r) => byRoundNums[r]?.length)
  if (!present.length) return []

  const orderByRound = {}
  // Seed: the last (deepest) round, ordered by num.
  const deepest = present[present.length - 1]
  orderByRound[deepest] = [...byRoundNums[deepest]].sort((a, b) => a - b)

  // Walk back toward Round of 32, expanding each parent into its two children.
  for (let i = present.length - 1; i > 0; i--) {
    const childRound = present[i - 1]
    const parentOrder = orderByRound[present[i]]
    const childOrder = []
    for (const parentNum of parentOrder) {
      const parent = byNum.get(parentNum)
      const a = feederNum(parent?.originalTeam1)
      const b = feederNum(parent?.originalTeam2)
      // Keep feeder order so children[2k], children[2k+1] feed parent k.
      if (a != null && byNum.has(a)) childOrder.push(a)
      if (b != null && byNum.has(b)) childOrder.push(b)
    }
    // Fallback: if the feed lacked feeder refs, fall back to num order so we
    // still render something coherent rather than dropping matches.
    orderByRound[childRound] =
      childOrder.length === byRoundNums[childRound].length
        ? childOrder
        : [...byRoundNums[childRound]].sort((a, b) => a - b)
  }

  const rounds = present.map((name) => ({
    name,
    matches: orderByRound[name].map((num) => byNum.get(num)),
  }))

  // Resolve placeholders: a real group placement (1A, 2B) becomes a team only
  // once that group has FINISHED — otherwise keep the placeholder so we never
  // show an unconfirmed, seed-order guess. Feeder slots (Wxx) start empty and
  // get filled by auto-advance below.
  const groups = buildGroups(matches)
  const done = completedGroups(matches)
  for (const round of rounds) {
    for (const match of round.matches) {
      match.team1 = isFeederSlot(match.team1) ? null : resolveBracketSlot(match.team1, groups, done)
      match.team2 = isFeederSlot(match.team2) ? null : resolveBracketSlot(match.team2, groups, done)
    }
  }

  // Auto-advance by FEEDER REFERENCE (not array index): each empty Wxx slot is
  // filled with the winner of exactly the match it points at, once that match
  // has finished. Only fills blanks — never overwrites real feed data.
  // Iterate rounds in order so wins cascade forward across multiple rounds.
  for (const round of rounds) {
    for (const match of round.matches) {
      for (const side of ['team1', 'team2']) {
        if (match[side]) continue
        const fnum = feederNum(match[`original${side === 'team1' ? 'Team1' : 'Team2'}`])
        if (fnum == null) continue
        const w = winnerOf(byNum.get(fnum))
        if (w) {
          match[side] = w
          match.advanced = { ...(match.advanced || {}), [side]: true }
        }
      }
    }
  }

  // Anything still empty: show the human-readable placeholder (Winner M74,
  // Best 3rd …) so the slot isn't blank.
  for (const round of rounds) {
    for (const match of round.matches) {
      if (!match.team1) match.team1 = resolveBracketSlot(match.originalTeam1, groups, done)
      if (!match.team2) match.team2 = resolveBracketSlot(match.originalTeam2, groups, done)
    }
  }

  return rounds
}

// A team's NEXT fixture for the countdown timer: must be a game that hasn't been
// played yet. 'finished' and 'awaiting' both mean the match is over (awaiting =
// over but result not yet posted), so neither counts as "next".
export function nextMatchFor(team, matches, now = Date.now()) {
  if (!team) return null
  const upcoming = matches
    .filter((m) => (m.team1 === team || m.team2 === team) && m.kickoff)
    .filter((m) => m.status === 'scheduled' || m.status === 'live')
    .sort((a, b) => a.kickoff - b.kickoff)
  return upcoming[0] || null
}

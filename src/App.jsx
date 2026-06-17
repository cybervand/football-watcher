import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  loadWorldCup,
  normalizeMatches,
  buildGroups,
  buildBracket,
} from './data/worldcup.js'
import { fetchLiveScores, teamPairKey } from './data/nifs.js'
import Bracket from './components/Bracket.jsx'
import Groups from './components/Groups.jsx'
import MatchList from './components/MatchList.jsx'

const POLL_MS = 60_000 // refresh live data every 60s

// Overlay live NIFS scores/statuses onto the openfootball fixtures, matched by
// team pair. NIFS drives scores for every round; the fixture list and bracket
// topology still come from openfootball. A NIFS score is oriented to the
// alphabetically-first team, so re-orient it to this match's team1/team2.
function applyLiveScores(matches, liveByPair) {
  if (!liveByPair?.size) return matches
  return matches.map((match) => {
    const live = liveByPair.get(teamPairKey(match.team1, match.team2))
    if (!live || !live.status) return match

    let score = match.score
    if (live.score) {
      const t1First = match.team1.toLowerCase().trim() <= match.team2.toLowerCase().trim()
      score = t1First ? live.score : [live.score[1], live.score[0]]
    }
    return {
      ...match,
      score,
      scoreFinal: live.scoreFinal,
      status: live.status,
      scoreSource: 'nifs',
      nifsId: live.id, // NIFS match id — lets the summary fetch this match's recap
    }
  })
}

export default function App() {
  const [raw, setRaw] = useState(null)
  const [source, setSource] = useState(null)
  const [view, setView] = useState('matches') // 'matches' | 'bracket' | 'groups'
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liveScores, setLiveScores] = useState(null)

  const refresh = useCallback(async () => {
    // Fixtures (openfootball) and live scores (NIFS) refresh together but
    // independently — a NIFS hiccup must not blank out the fixtures.
    const [fixtures, live] = await Promise.allSettled([loadWorldCup(), fetchLiveScores()])

    if (fixtures.status === 'fulfilled') {
      setRaw(fixtures.value.data)
      setSource(fixtures.value.source)
      setLastUpdated(new Date())
      setError(null)
    } else {
      setError(fixtures.reason?.message || 'fixture load failed')
    }
    // Keep the previous live scores if this fetch failed, rather than dropping
    // to no-live-data and reverting visible scores.
    if (live.status === 'fulfilled' && live.value.size) setLiveScores(live.value)

    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  const baseMatches = useMemo(() => (raw ? normalizeMatches(raw) : []), [raw])
  // Live NIFS scores overlay onto the openfootball fixtures.
  const matches = useMemo(
    () => applyLiveScores(baseMatches, liveScores),
    [baseMatches, liveScores],
  )
  const groups = useMemo(() => buildGroups(matches), [matches])
  const bracket = useMemo(() => buildBracket(matches), [matches])

  const liveCount = matches.filter((m) => m.status === 'live').length

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__titlewrap">
          <h1 className="app__title">World Cup 2026 - Live Bracket</h1>
          <p className="app__sub">
            Canada / Mexico / USA | 48 teams / 12 groups / knockout to glory
          </p>
        </div>
        <div className="app__status">
          {liveCount > 0 && <span className="badge badge--live">{liveCount} LIVE</span>}
          <span className={`badge ${source === 'live' ? 'badge--ok' : 'badge--warn'}`}>
            {source === 'live' ? 'Live data' : source === 'fallback' ? 'Offline data' : '...'}
          </span>
          {liveScores?.size > 0 && (
            <span className="badge badge--ok" title="Live scores from NIFS (NRK's source)">
              NIFS scores
            </span>
          )}
          {lastUpdated && (
            <span className="app__updated">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button className="app__refresh" onClick={refresh} title="Refresh now">
            Refresh
          </button>
        </div>
      </header>

      <nav className="app__tabs">
        <button
          className={view === 'matches' ? 'tab tab--active' : 'tab'}
          onClick={() => setView('matches')}
        >
          Matches
        </button>
        <button
          className={view === 'bracket' ? 'tab tab--active' : 'tab'}
          onClick={() => setView('bracket')}
        >
          Knockout Bracket
        </button>
        <button
          className={view === 'groups' ? 'tab tab--active' : 'tab'}
          onClick={() => setView('groups')}
        >
          Group Stage
        </button>
      </nav>

      <main className="app__main">
        {loading && <p className="empty">Loading World Cup data...</p>}
        {error && <p className="empty empty--err">Could not load data: {error}</p>}
        {!loading && view === 'matches' && <MatchList matches={matches} />}
        {!loading && view === 'bracket' && (
          <Bracket rounds={bracket} allMatches={matches} />
        )}
        {!loading && view === 'groups' && <Groups groups={groups} matches={matches} />}
      </main>

      <footer className="app__footer">
        Data: openfootball (public domain) / flags: flagcdn.com / winners auto-advance /
        countdowns are live to each team's next kickoff
      </footer>
    </div>
  )
}

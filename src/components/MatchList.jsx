import { useState } from 'react'
import Fixture from './Fixture.jsx'

function isRealTeam(name) {
  if (!name) return false
  return !/^([123][A-L]|[WL]\d+)$/.test(name) &&
    !/^Winner |^Loser |^Best 3rd/.test(name)
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

// "2026-06-11" style key for grouping, plus a human label "Thursday, June 11".
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

// Group matches into [{ key, label, items }] ordered by day. `dir = 'asc'`
// = oldest day first (upcoming); `'desc'` = newest day first (completed).
// Matches WITHIN a day follow the same direction, so for completed the latest
// kickoff is on top and the earliest is at the bottom.
function groupByDay(matches, dir = 'asc') {
  const map = new Map()
  for (const m of matches) {
    if (!m.kickoff) continue
    const k = dayKey(m.kickoff)
    if (!map.has(k)) map.set(k, { key: k, label: dayLabel(m.kickoff), items: [] })
    map.get(k).items.push(m)
  }
  const sign = dir === 'asc' ? 1 : -1
  const days = [...map.values()].sort((a, b) => sign * a.key.localeCompare(b.key))
  for (const day of days) day.items.sort((a, b) => sign * (a.kickoff - b.kickoff))
  return days
}

export default function MatchList({ matches }) {
  const now = new Date()
  // Upcoming starts collapsed so the page leads with live + completed.
  const [upcomingOpen, setUpcomingOpen] = useState(false)
  const real = matches.filter((m) => isRealTeam(m.team1) && isRealTeam(m.team2))

  const live = []
  const awaiting = []
  const today = []
  const upcoming = []
  const recent = []

  for (const m of real) {
    if (m.status === 'live') { live.push(m); continue }
    if (m.status === 'awaiting') { awaiting.push(m); continue }
    if (m.status === 'finished') { recent.push(m); continue }
    if (m.kickoff && sameDay(m.kickoff, now)) today.push(m)
    else upcoming.push(m)
  }

  const byTime = (a, b) => (a.kickoff && b.kickoff ? a.kickoff - b.kickoff : 0)
  live.sort(byTime)
  awaiting.sort(byTime)
  today.sort(byTime)
  upcoming.sort(byTime)
  recent.sort((a, b) => (a.kickoff && b.kickoff ? b.kickoff - a.kickoff : 0))

  // Flat sections (live / awaiting / today) stay as simple lists.
  const flatSections = [
    { key: 'live', title: 'Live now', items: live, cls: 'section--live' },
    { key: 'awaiting', title: 'Just finished - awaiting result', items: awaiting },
    { key: 'today', title: 'Later today', items: today },
  ].filter((s) => s.items.length > 0)

  // Both grouped BY DAY. Completed runs NEWEST day first (June 17 → June 11);
  // upcoming runs soonest-first.
  const completedDays = groupByDay(recent, 'desc')
  const upcomingDays = groupByDay(upcoming, 'asc')

  const anything = flatSections.length || completedDays.length || upcomingDays.length
  if (!anything) {
    return <p className="empty">No fixtures with confirmed teams yet.</p>
  }

  return (
    <div className="matchlist">
      {flatSections.map((s) => (
        <section className={`section ${s.cls || ''}`} key={s.key}>
          <h3 className="section__title">{s.title}{' '}
            <span className="section__count">{s.items.length}</span>
          </h3>
          <ul className="fixtures fixtures--wide">
            {s.items.map((m) => (
              <Fixture key={m.id} m={m} showGroup />
            ))}
          </ul>
        </section>
      ))}

      {/* Upcoming sits between live and completed, COLLAPSED by default. */}
      {upcomingDays.length > 0 && (
        <section className="section section--collapsible">
          <button
            className="section__toggle"
            onClick={() => setUpcomingOpen((v) => !v)}
            aria-expanded={upcomingOpen}
          >
            <span className={`section__caret ${upcomingOpen ? 'is-open' : ''}`}>▶</span>
            <span className="section__title section__title--inline">Upcoming{' '}
              <span className="section__count">{upcoming.length}</span>
            </span>
          </button>
          {upcomingOpen &&
            upcomingDays.map((day) => (
              <div className="dayblock" key={day.key}>
                <h4 className="dayblock__date">{day.label}</h4>
                <ul className="fixtures fixtures--wide">
                  {day.items.map((m) => (
                    <Fixture key={m.id} m={m} showGroup showTime />
                  ))}
                </ul>
              </div>
            ))}
        </section>
      )}

      {/* Completed matches: newest day at top, oldest (June 11) at the bottom. */}
      {completedDays.length > 0 && (
        <section className="section">
          <h3 className="section__title">Completed matches{' '}
            <span className="section__count">{recent.length}</span>
          </h3>
          {completedDays.map((day) => (
            <div className="dayblock" key={day.key}>
              <h4 className="dayblock__date">{day.label}</h4>
              <ul className="fixtures fixtures--wide">
                {day.items.map((m) => (
                  <Fixture key={m.id} m={m} showGroup showTime />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

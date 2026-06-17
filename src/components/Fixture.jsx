import { useState } from 'react'
import FlagChip from './FlagChip.jsx'
import Countdown from './Countdown.jsx'
import MatchSummary from './MatchSummary.jsx'

// One real head-to-head fixture. `showTime` adds the kickoff clock time (used in
// the day-grouped views, where the day itself is already the date heading).
export default function Fixture({ m, showGroup = false, showTime = false }) {
  const [showSummary, setShowSummary] = useState(false)
  const hasScore = !!m.score
  const [a, b] = m.score || [null, null]
  const dateLabel = m.kickoff
    ? m.kickoff.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : ''
  const timeLabel = m.kickoff
    ? m.kickoff.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : ''
  const tag = m.group ? `Group ${m.group}` : m.round || ''

  // Finished matches are clickable to open a recap.
  const recapable = m.status === 'finished'

  return (
    <li
      className={`fixture fixture--${m.status} ${recapable ? 'fixture--recapable' : ''}`}
      onClick={recapable ? () => setShowSummary(true) : undefined}
      title={recapable ? 'Click for match summary' : undefined}
    >
      {showSummary && <MatchSummary match={m} onClose={() => setShowSummary(false)} />}
      {showTime && timeLabel && <span className="fixture__kickoff">{timeLabel}</span>}
      {showGroup && tag && <span className="fixture__tag">{tag}</span>}

      <span className="fixture__team fixture__team--home">
        <FlagChip name={m.team1} size="xs" />
      </span>

      <span className="fixture__mid">
        {hasScore ? (
          <span className="fixture__score">
            {a ?? 0} <span className="fixture__dash">-</span> {b ?? 0}
          </span>
        ) : m.status === 'awaiting' ? (
          <span className="fixture__score fixture__score--pending">
            <span className="fixture__dash">-</span>
          </span>
        ) : (
          <span className="fixture__time">{dateLabel || 'TBD'}</span>
        )}
        <span className="fixture__status">
          {m.status === 'finished' ? (
            <span className="fixture__ft">FT</span>
          ) : (
            <Countdown to={m.kickoff} status={m.status} />
          )}
        </span>
      </span>

      <span className="fixture__team fixture__team--away">
        <FlagChip name={m.team2} size="xs" />
      </span>
    </li>
  )
}

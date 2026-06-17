import FlagChip from './FlagChip.jsx'
import Countdown from './Countdown.jsx'
import { winnerOf, nextMatchFor } from '../data/worldcup.js'

// One knockout slot: two teams stacked. Each team shows its flag, the score if
// decided, and a live countdown to that team's next game.
export default function BracketMatch({ match, allMatches }) {
  const winner = winnerOf(match)
  const [s1, s2] = match.score || [null, null]

  const row = (team, sideScore, side) => {
    const isWinner = winner && team === winner
    const isLoser = winner && team && team !== winner
    const advanced = match.advanced?.[side]
    const next = nextMatchFor(team, allMatches)

    return (
      <div className={`bm__row ${isWinner ? 'is-winner' : ''} ${isLoser ? 'is-loser' : ''}`}>
        <div className="bm__rowtop">
          <FlagChip name={team} size="sm" />
          <span className="bm__score">{sideScore ?? ''}</span>
          {advanced && <span className="bm__advanced" title="Advanced from previous round">ADV</span>}
        </div>
        <div className="bm__next">
          {next ? (
            <Countdown to={next.kickoff} status={next.status} />
          ) : team ? (
            <span className="bm__nonext">{winner === team ? 'awaiting next' : winner ? 'eliminated' : ''}</span>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={`bm ${match.status === 'live' ? 'bm--live' : ''}`}>
      {match.num != null && <div className="bm__num">Match {match.num}</div>}
      {row(match.team1, s1, 'team1')}
      <div className="bm__vs">vs</div>
      {row(match.team2, s2, 'team2')}
    </div>
  )
}

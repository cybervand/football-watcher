import FlagChip from './FlagChip.jsx'
import Fixture from './Fixture.jsx'

// 12 group cards. Each shows the standings table (top 2 green = qualify, 3rd
// amber = possible best-third) AND the list of that group's fixtures with
// scores / kickoff countdowns.
export default function Groups({ groups, matches = [] }) {
  const names = Object.keys(groups).sort()
  if (!names.length) return <p className="empty">No group data in the feed yet.</p>

  // Bucket each group's fixtures, soonest-first.
  const fixturesByGroup = {}
  for (const m of matches) {
    if (!m.group) continue
    ;(fixturesByGroup[m.group] ||= []).push(m)
  }
  for (const g of Object.keys(fixturesByGroup)) {
    fixturesByGroup[g].sort((x, y) => {
      if (x.kickoff && y.kickoff) return x.kickoff - y.kickoff
      return 0
    })
  }

  return (
    <div className="groups">
      {names.map((name) => (
        <div className="group" key={name}>
          <h3 className="group__title">Group {name}</h3>
          <table className="group__table">
            <thead>
              <tr>
                <th className="ta-l">Team</th>
                <th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {groups[name].map((row, i) => (
                <tr key={row.team} className={i < 2 ? 'qualify' : i === 2 ? 'maybe' : ''}>
                  <td className="ta-l">
                    <FlagChip name={row.team} size="xs" />
                  </td>
                  <td>{row.P}</td>
                  <td>{row.W}</td>
                  <td>{row.D}</td>
                  <td>{row.L}</td>
                  <td>{row.GF - row.GA >= 0 ? '+' : ''}{row.GF - row.GA}</td>
                  <td className="pts">{row.Pts}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {fixturesByGroup[name]?.length > 0 && (
            <>
              <h4 className="group__fixhead">Matches</h4>
              <ul className="fixtures">
                {fixturesByGroup[name].map((m) => (
                  <Fixture key={m.id} m={m} />
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

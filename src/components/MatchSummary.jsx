import { useEffect, useState } from 'react'
import { buildMatchSummary } from '../data/matchSummary.js'

// Modal recap for a finished match. Fetches the NIFS commentary, translates the
// full-time summary + goal moments to English (or falls back to team context),
// and renders them. Close by clicking the backdrop, the X, or pressing Escape.
export default function MatchSummary({ match, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [lang, setLang] = useState('en') // 'en' = translated, 'no' = original Norwegian

  useEffect(() => {
    let alive = true
    setState({ loading: true, data: null, error: null })
    buildMatchSummary(match)
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((e) => alive && setState({ loading: false, data: null, error: e.message }))
    return () => {
      alive = false
    }
  }, [match?.nifsId, match?.team1, match?.team2])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock the page behind the modal so scrolling never bleeds through.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const score = match.score ? `${match.score[0]} - ${match.score[1]}` : ''
  const { loading, data, error } = state

  // The EN/NO toggle is only meaningful for NIFS recaps where we kept the
  // original Norwegian. Pick the right text for the chosen language.
  const hasNorwegian = data?.source === 'nifs' && (data.recapNo || data.goalsNo?.length)
  const showNo = lang === 'no' && hasNorwegian
  const recapText = showNo ? data?.recapNo : data?.recap
  const goalsText = showNo ? data?.goalsNo : data?.goals

  return (
    <div className="summary__backdrop" onClick={onClose}>
      <div className="summary" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="summary__close" onClick={onClose} aria-label="Close">×</button>

        <div className="summary__head">
          <h3 className="summary__teams">{match.team1} {score} {match.team2}</h3>
          <span className="summary__tag">{match.group ? `Group ${match.group}` : match.round || ''}</span>
        </div>

        {hasNorwegian && (
          <div className="summary__langtoggle" role="group" aria-label="Summary language">
            <button
              className={lang === 'en' ? 'langbtn langbtn--active' : 'langbtn'}
              onClick={() => setLang('en')}
            >
              English
            </button>
            <button
              className={lang === 'no' ? 'langbtn langbtn--active' : 'langbtn'}
              onClick={() => setLang('no')}
            >
              Norsk
            </button>
          </div>
        )}

        {loading && <p className="summary__loading">Reading and translating the match report…</p>}
        {error && <p className="summary__error">Couldn’t load a summary: {error}</p>}

        {data && (
          <div className="summary__body">
            {data.source === 'nifs' ? (
              <>
                {recapText && (
                  <section className="summary__section">
                    <h4>{showNo ? 'Hva skjedde' : 'What happened'}</h4>
                    <p>{recapText}</p>
                  </section>
                )}
                {goalsText?.length > 0 && (
                  <section className="summary__section">
                    <h4>{showNo ? 'Nøkkeløyeblikk' : 'Key moments'}</h4>
                    <ul className="summary__goals">
                      {goalsText.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </section>
                )}
                <p className="summary__src">
                  {showNo
                    ? 'Referat fra NRK/NIFS (original norsk).'
                    : 'Recap from NRK/NIFS, auto-translated to English.'}
                </p>
              </>
            ) : data.context?.length ? (
              <>
                <section className="summary__section">
                  <h4>About the teams</h4>
                  {data.context.map((c, i) => (
                    <p key={i}>{c}</p>
                  ))}
                </section>
                <p className="summary__src">Team background from Wikipedia. No match report available yet.</p>
              </>
            ) : (
              <p className="summary__loading">No summary available for this match yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { buildMatchSummary, translateSummaryStream } from '../data/matchSummary.js'

// Modal recap for a finished match. Shows the ORIGINAL Norwegian instantly;
// switching to English runs the translator on demand (and caches it). Close by
// clicking the backdrop, the X, or pressing Escape.
export default function MatchSummary({ match, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [lang, setLang] = useState('no') // default to original Norwegian
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    let alive = true
    setState({ loading: true, data: null, error: null })
    setLang('no')
    buildMatchSummary(match)
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((e) => alive && setState({ loading: false, data: null, error: e.message }))
    return () => {
      alive = false
    }
  }, [match?.nifsId, match?.team1, match?.team2])

  // Switching to English translates lazily (once), STREAMING the text in as it's
  // produced, then caches it.
  async function chooseEnglish() {
    setLang('en')
    const d = state.data
    if (!d || d.recap || d.goals?.length) return // already have English
    if (!(d.recapNo || d.goalsNo?.length)) return // nothing to translate
    setTranslating(true)
    try {
      const en = await translateSummaryStream(match, d, (partial) => {
        // live update as tokens arrive
        setState((s) => ({ ...s, data: { ...s.data, recap: partial.recap, goals: partial.goals } }))
      })
      setState((s) => ({ ...s, data: { ...s.data, recap: en.recap, goals: en.goals } }))
    } catch {
      /* keep Norwegian visible if translation fails */
    } finally {
      setTranslating(false)
    }
  }

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

  // The toggle only applies to NIFS recaps where we have the Norwegian original.
  const hasNorwegian = data?.source === 'nifs' && (data.recapNo || data.goalsNo?.length)
  // Show English only when chosen AND it's ready; otherwise show Norwegian (so
  // it's never blank while translating or if translation failed).
  const englishReady = !!(data?.recap || data?.goals?.length)
  const showNo = !(lang === 'en' && englishReady)
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
              className={lang === 'no' ? 'langbtn langbtn--active' : 'langbtn'}
              onClick={() => setLang('no')}
            >
              Norsk
            </button>
            <button
              className={lang === 'en' ? 'langbtn langbtn--active' : 'langbtn'}
              onClick={chooseEnglish}
            >
              {translating ? 'Translating…' : 'English'}
            </button>
          </div>
        )}

        {loading && <p className="summary__loading">Reading the match report…</p>}
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

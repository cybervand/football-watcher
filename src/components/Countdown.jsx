import { useEffect, useState } from 'react'

export default function Countdown({ to, status, done = null }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (status === 'finished') return done
  if (status === 'live') return <span className="countdown countdown--live">LIVE</span>
  if (status === 'awaiting')
    return <span className="countdown countdown--awaiting" title="Match ended - awaiting result">FT?</span>
  if (!to) return done

  const diff = to.getTime() - now
  if (diff <= 0) return <span className="countdown" title={to.toLocaleString()}>00:00:00</span>

  const s = Math.floor(diff / 1000)
  const days = Math.floor(s / 86400)
  const hrs = Math.floor((s % 86400) / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60
  const pad = (n) => String(n).padStart(2, '0')

  return (
    <span className="countdown" title={to.toLocaleString()}>
      {days > 0 && <span className="countdown__d">{days}d </span>}
      {pad(hrs)}:{pad(mins)}:{pad(secs)}
    </span>
  )
}

import { useEffect, useState } from 'react'
import { flagEmoji, flagImgUrl, isoFor } from '../data/flags.js'

const SUBDIVISION_FLAGS = {
  'gb-eng': '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  'gb-sct': '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  'gb-wls': '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
}

function fallbackLabel(name, iso) {
  if (iso && SUBDIVISION_FLAGS[iso]) return SUBDIVISION_FLAGS[iso]
  const emoji = name ? flagEmoji(name) : null
  if (emoji) return emoji
  if (!name) return 'TBD'
  if (iso) return iso.split('-').at(-1).toUpperCase()
  return name.includes('Winner') || name.includes('Loser') || name.includes('Best 3rd')
    ? 'TBD'
    : name.slice(0, 2).toUpperCase()
}

// A country shown as a flag inside a compact chip. Real countries use local
// PNGs from public/flags, with emoji/text fallback for unresolved slots.
export default function FlagChip({ name, size = 'md' }) {
  const [imgFailed, setImgFailed] = useState(false)
  const placeholder = !name
  const iso = name ? isoFor(name) : null
  const img = iso && !imgFailed ? flagImgUrl(name) : null
  const flag = fallbackLabel(name, iso)

  useEffect(() => {
    setImgFailed(false)
  }, [name])

  return (
    <div className={`flagchip flagchip--${size} ${placeholder ? 'flagchip--tbd' : ''}`}>
      <span className="flagchip__flag" aria-hidden="true">
        {img ? (
          <img src={img} alt="" loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <span className={iso ? 'flagchip__emoji' : 'flagchip__fallback'}>{flag}</span>
        )}
      </span>
      <span className="flagchip__name">{name || 'TBD'}</span>
    </div>
  )
}

import { useLayoutEffect, useRef, useState } from 'react'
import BracketMatch from './BracketMatch.jsx'

const TOTAL_ROWS = 32
const COL_W = 136
const GAP = 24
const ROW_H = 34
const FIELD_W = COL_W * 9 + GAP * 8
const HEADINGS_H = 34 // approx height of the round-name row above the field
const FIELD_H = ROW_H * TOTAL_ROWS
const TREE_H = FIELD_H + HEADINGS_H

const ROUND_NAMES = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals']
const SPAN_BY_COUNT = {
  1: 8,
  2: 6,
  4: 4,
  8: 3,
}

function splitRound(round) {
  const matches = round?.matches || []
  const mid = Math.ceil(matches.length / 2)
  return [matches.slice(0, mid), matches.slice(mid)]
}

function slotPlacement(col, index, count) {
  const span = SPAN_BY_COUNT[count] || 4
  const step = TOTAL_ROWS / Math.max(count, 1)
  const row = Math.round(index * step + (step - span) / 2) + 1
  const y = (row - 1) * ROW_H + (span * ROW_H) / 2

  return {
    col,
    row,
    span,
    y,
    style: {
      gridColumn: col,
      gridRow: `${row} / span ${span}`,
    },
  }
}

function xCenter(col) {
  return (col - 1) * (COL_W + GAP) + COL_W / 2
}

function leftEdge(col) {
  return xCenter(col) - COL_W / 2
}

function rightEdge(col) {
  return xCenter(col) + COL_W / 2
}

function teePath(fromCol, parentCol, children, parent, side) {
  if (!parent || children.length < 2) return null

  if (side === 'left') {
    const midX = (rightEdge(fromCol) + leftEdge(parentCol)) / 2
    return [
      `M ${rightEdge(fromCol)} ${children[0].y} H ${midX}`,
      `M ${rightEdge(fromCol)} ${children[1].y} H ${midX}`,
      `M ${midX} ${children[0].y} V ${children[1].y}`,
      `M ${midX} ${parent.y} H ${leftEdge(parentCol)}`,
    ].join(' ')
  }

  const midX = (rightEdge(parentCol) + leftEdge(fromCol)) / 2
  return [
    `M ${rightEdge(parentCol)} ${parent.y} H ${midX}`,
    `M ${midX} ${children[0].y} V ${children[1].y}`,
    `M ${midX} ${children[0].y} H ${leftEdge(fromCol)}`,
    `M ${midX} ${children[1].y} H ${leftEdge(fromCol)}`,
  ].join(' ')
}

function connectionPaths(layout) {
  const paths = []

  for (let col = 1; col <= 3; col++) {
    const children = layout.filter((slot) => slot.col === col)
    const parents = layout.filter((slot) => slot.col === col + 1)
    parents.forEach((parent, i) => {
      const path = teePath(col, col + 1, children.slice(i * 2, i * 2 + 2), parent, 'left')
      if (path) paths.push(path)
    })
  }

  const leftSemi = layout.find((slot) => slot.col === 4)
  const final = layout.find((slot) => slot.col === 5)
  const rightSemi = layout.find((slot) => slot.col === 6)
  if (leftSemi && final) {
    paths.push(`M ${rightEdge(4)} ${leftSemi.y} H ${leftEdge(5)}`)
  }
  if (final && rightSemi) {
    paths.push(`M ${rightEdge(5)} ${final.y} H ${leftEdge(6)}`)
  }

  for (let col = 7; col <= 9; col++) {
    const children = layout.filter((slot) => slot.col === col)
    const parents = layout.filter((slot) => slot.col === col - 1)
    parents.forEach((parent, i) => {
      const path = teePath(col, col - 1, children.slice(i * 2, i * 2 + 2), parent, 'right')
      if (path) paths.push(path)
    })
  }

  return paths
}

// A mirrored tournament tree: first half branches in from the left, second half
// branches in from the right, and both sides meet at the final.
// Scale the fixed-size tree down so it always fits the available width — no
// sideways scrolling, on any screen. We measure the container and apply a
// transform; the SVG connectors scale with it, staying aligned.
function useFitScale() {
  const ref = useRef(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const avail = el.clientWidth
      if (avail > 0) setScale(Math.min(1, avail / FIELD_W))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, scale]
}

export default function Bracket({ rounds, allMatches }) {
  const [fitRef, scale] = useFitScale()
  if (!rounds?.length) {
    return <p className="empty">No knockout matches in the feed yet.</p>
  }

  const byName = Object.fromEntries(rounds.map((round) => [round.name, round]))
  const halves = Object.fromEntries(ROUND_NAMES.map((name) => [name, splitRound(byName[name])]))
  const finalMatch = byName.Final?.matches?.[0]

  const columns = [
    { col: 1, name: 'Round of 32', matches: halves['Round of 32'][0] },
    { col: 2, name: 'Round of 16', matches: halves['Round of 16'][0] },
    { col: 3, name: 'Quarter-finals', matches: halves['Quarter-finals'][0] },
    { col: 4, name: 'Semi-finals', matches: halves['Semi-finals'][0] },
    { col: 5, name: 'Final', matches: finalMatch ? [finalMatch] : [] },
    { col: 6, name: 'Semi-finals', matches: halves['Semi-finals'][1] },
    { col: 7, name: 'Quarter-finals', matches: halves['Quarter-finals'][1] },
    { col: 8, name: 'Round of 16', matches: halves['Round of 16'][1] },
    { col: 9, name: 'Round of 32', matches: halves['Round of 32'][1] },
  ]

  const slots = columns.flatMap((column) =>
    column.matches.map((match, index) => ({
      ...slotPlacement(column.col, index, column.matches.length),
      match,
    })),
  )
  const paths = connectionPaths(slots)

  return (
    <div className="bracket" aria-label="Knockout bracket" ref={fitRef}>
      {/* Reserve the scaled height so the shrunk tree leaves no gap / no clip. */}
      <div className="bracket__scaler" style={{ height: TREE_H * scale }}>
        <div
          className="bracket__tree"
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
        <div className="bracket__headings">
          {columns.map((column) => (
            <h3 className="bracket__round" style={{ gridColumn: column.col }} key={`${column.col}-${column.name}`}>
              {column.name}
            </h3>
          ))}
        </div>

        <div className="bracket__field">
          <svg className="bracket__lines" viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} aria-hidden="true">
            {paths.map((path, index) => (
              <path d={path} key={index} />
            ))}
          </svg>

          {slots.map((slot) => (
            <div className="bracket__slot" style={slot.style} key={slot.match.id}>
              <BracketMatch match={slot.match} allMatches={allMatches} />
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  )
}

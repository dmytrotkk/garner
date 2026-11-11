import { percent } from '../../core/format.ts'
import { color } from '../hues.ts'
import { Tooltip } from '../tooltip.tsx'
import type { Slice } from './blend.tsx'

const radius = 15
const length = 2 * Math.PI * radius
const gap = 1.5

export function Ring({ slices }: { slices: readonly Slice[] }) {
  const parts = slices.filter(({ value }) => value > 0).toSorted((a, b) => b.value - a.value)
  const total = parts.reduce((sum, { value }) => sum + value, 0)
  const spacing = parts.length > 1 ? gap : 0
  const scale = (length - spacing * parts.length) / total
  const arcs = parts.map((slice, index) => ({
    ...slice,
    start: parts.slice(0, index).reduce((sum, { value }) => sum + value * scale + spacing, 0),
    arc: slice.value * scale,
    share: slice.value / total,
  }))
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label={arcs.map(({ label, share }) => `${label} ${percent(share)}`).join(', ')}
      className="size-10 shrink-0 -rotate-90"
    >
      {arcs.map(({ key, label, hue, start, arc, share }) => (
        <Tooltip key={key} label={`${label} ${percent(share)}`}>
          <circle
            cx={20}
            cy={20}
            r={radius}
            fill="none"
            stroke={color(hue)}
            strokeWidth={6}
            strokeDasharray={`${arc} ${length - arc}`}
            strokeDashoffset={-start}
            className="cursor-default transition hover:opacity-80"
          />
        </Tooltip>
      ))}
    </svg>
  )
}

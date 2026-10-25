import type { IconSvgElement } from '@hugeicons/react'
import { Icon } from './icon'

export type Mark = { viewBox: string; d: string }

export type Glyph = IconSvgElement | { mark: Mark } | { letter: string }

export function Glyph({ glyph }: { glyph: Glyph }) {
  if ('mark' in glyph)
    return (
      <svg
        data-icon
        viewBox={glyph.mark.viewBox}
        aria-hidden="true"
        className="size-4 shrink-0 fill-current"
      >
        <path d={glyph.mark.d} />
      </svg>
    )
  if ('letter' in glyph)
    return (
      <span
        data-icon
        aria-hidden="true"
        className="grid size-4 shrink-0 place-items-center rounded-chip border border-current text-mark"
      >
        {glyph.letter}
      </span>
    )
  return <Icon icon={glyph} />
}

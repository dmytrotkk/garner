import type { ReactNode } from 'react'
import type { Searchable } from '../core/search.ts'
import type { Glyph } from './glyph.tsx'
import type { Hue } from './hues.ts'
import type { IconSvgElement } from './icon.tsx'
import type { SymbolName } from './symbols.ts'

export type Command = Searchable & {
  id: string
  icon:
    | Glyph
    | { token: string; symbol: string }
    | { tile: { hue: Hue; icon: IconSvgElement } | null }
  aside?: ReactNode
  tone?: 'negative'
  run: () => void | Promise<void>
}

export type Action = Command & { symbol: SymbolName }

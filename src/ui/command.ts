import type { IconSvgElement } from '@hugeicons/react'
import type { ReactNode } from 'react'
import type { Searchable } from '../core/search'
import type { Glyph } from './glyph'
import type { Hue } from './hues'
import type { SymbolName } from './symbols'

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

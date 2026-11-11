import { dash } from '../core/format.ts'
import type { Position } from '../data/portfolio.ts'
import type { Column } from '../ui/grid.tsx'
import { Amount, Money } from './-money.tsx'

export const chain: Column<Position> = { header: 'Chain', cell: ({ chain }) => chain ?? dash }

export const placed: readonly Column<Position>[] = [
  { header: 'Amount', cell: ({ assetId, amount }) => <Amount value={amount} id={assetId} /> },
  { header: 'Value', cell: ({ value }) => <Money value={value} /> },
]

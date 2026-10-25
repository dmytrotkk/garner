import { dash } from '../core/format'
import type { Position } from '../data/portfolio'
import type { Column } from '../ui/table'
import { Amount, Money } from './-money'

export const chain: Column<Position> = { header: 'Chain', cell: ({ chain }) => chain ?? dash }

export const placed: readonly Column<Position>[] = [
  { header: 'Amount', cell: ({ assetId, amount }) => <Amount value={amount} id={assetId} /> },
  { header: 'Value', cell: ({ value }) => <Money value={value} /> },
]

import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { useMemo, useState } from 'react'
import {
  cashflow,
  type Grain,
  grainOf,
  monthAt,
  period,
  type Range,
  type Ref,
  type Scope,
  shift,
} from '../data/cashflow'
import type { Movement } from '../data/ledger'
import { named } from '../data/query'
import { dayOf } from '../data/schema'
import type { Valuation } from '../data/spending'
import { Button } from '../ui/button'
import type { Item } from '../ui/charts/frame'
import { type Node, SankeyChart } from '../ui/charts/sankey'
import { color, type Hue } from '../ui/hues'
import { Icon } from '../ui/icon'
import { Segmented } from '../ui/segmented'
import { hues } from './-categories'
import { root } from './-data'
import { Money, useCompact } from './-money'

type Props = { rows: readonly Movement[]; context: Valuation; scope: Scope; initial: Range }

type Pick = Grain | 'custom'

const grains: readonly { value: Pick; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
]

const days = ({ from, to }: Range) => ({
  from: dayOf(Date.parse(`${from}-01`)),
  to: dayOf(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5)), 0)),
})

export function Cashflow({ rows, context, scope, initial }: Props) {
  const { institutions, accounts, byCategory, merchants } = root.useLoaderData()
  const [range, setRange] = useState(initial)
  const compact = useCompact(context.currency)
  const owners = useMemo(
    () =>
      new Map(
        institutions.flatMap((institution) =>
          institution.accounts.map(({ id }) => [id, institution.id]),
        ),
      ),
    [institutions],
  )
  const flow = useMemo(
    () => cashflow(rows, range, scope, owners, context),
    [rows, range, scope, owners, context],
  )
  const sends = new Set(flow.edges.map(({ from }) => from))
  const name = (ref: Ref): string => {
    switch (ref.kind) {
      case 'category':
        return byCategory.get(ref.categoryId)?.name ?? 'Category'
      case 'merchant':
        return merchants.find(({ id }) => id === ref.merchantId)?.name ?? 'Merchant'
      case 'account':
        return accounts.get(ref.accountId)?.name ?? 'Account'
      case 'institution':
        return institutions.find(({ id }) => id === ref.institutionId)?.name ?? 'Institution'
      case 'none':
        return 'No category'
      case 'other':
        return 'Other'
      case 'kept':
        return 'Kept'
      case 'balance':
        return 'From balance'
    }
  }
  const hue = (ref: Ref, leaf: boolean): Hue | undefined => {
    switch (ref.kind) {
      case 'category':
        return hues[byCategory.get(ref.categoryId)?.icon ?? 'tag']
      case 'merchant':
        return hues[byCategory.get(ref.categoryId)?.icon ?? 'transfer']
      case 'account':
      case 'institution':
        return leaf ? 'brass' : undefined
      case 'none':
      case 'other':
        return 'gray'
      default:
        return undefined
    }
  }
  const nodes = flow.nodes.map(({ id, ref }): Node => {
    const side = id.startsWith('in:') ? 'in' : id.startsWith('out:') ? 'out' : undefined
    const leaf = side !== undefined || !sends.has(id)
    const owned = ref.kind === 'account' || ref.kind === 'institution'
    const prefix = owned && side === 'in' ? 'From ' : owned && side === 'out' ? 'To ' : ''
    const items: readonly Item[] | undefined =
      ref.kind === 'other'
        ? ref.folded.map((fold) => ({
            key: name(fold.ref),
            name: name(fold.ref),
            value: fold.value,
            color: color(hue(fold.ref, true) ?? 'gray'),
          }))
        : undefined
    return { key: id, label: `${prefix}${name(ref)}`, hue: hue(ref, leaf), ...(items && { items }) }
  })
  const now = monthAt(Date.now())
  const grain = grainOf(range) ?? 'custom'
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Previous period"
            onClick={() => setRange(shift(range, -1))}
          >
            <Icon icon={ArrowLeft01Icon} />
          </Button>
          <span className="min-w-28 text-center text-caption font-medium">
            {named(days(range))}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Next period"
            disabled={range.to >= now}
            onClick={() => setRange(shift(range, 1))}
          >
            <Icon icon={ArrowRight01Icon} />
          </Button>
        </div>
        <Segmented
          label="Period"
          value={grain}
          options={grains}
          onChange={(next) => next !== 'custom' && setRange(period(next, range.to))}
        />
      </div>
      <div className="h-96">
        {flow.edges.length ? (
          <SankeyChart
            nodes={nodes}
            links={flow.edges}
            format={(amount) => <Money value={{ amount, currency: context.currency }} />}
            compact={compact}
          />
        ) : (
          <p className="text-dim">No movements in {named(days(range))}.</p>
        )}
      </div>
      {flow.unpriced > 0 && (
        <p className="text-caption text-dim">
          {flow.unpriced} {flow.unpriced === 1 ? 'movement' : 'movements'} on days without a rate{' '}
          {flow.unpriced === 1 ? 'is' : 'are'} left out.
        </p>
      )}
    </div>
  )
}

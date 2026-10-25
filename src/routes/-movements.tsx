import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import {
  dash,
  date,
  day,
  moment,
  month,
  monthShort,
  plural,
  quantity,
  timed,
  units,
} from '../core/format'
import type { CategoryIcon } from '../data/categories'
import type { Db } from '../data/db'
import { type Movement, movements, type Scope } from '../data/ledger'
import type { MerchantKind } from '../data/merchants'
import { monthOf, scale } from '../data/schema'
import { internal, months } from '../data/spending'
import { peer } from '../data/transfers'
import { Card } from '../ui/card'
import { BlendChart } from '../ui/charts/blend'
import { Ring } from '../ui/charts/ring'
import { type Column, DataTable, type Fold, type Group } from '../ui/data-table'
import { Stat } from '../ui/page'
import { Blank, Tile } from '../ui/tile'
import { Tooltip } from '../ui/tooltip'
import { Assigned, hues, icons, kindIcons } from './-categories'
import { movementCommands } from './-commands'
import { root } from './-data'
import { Money, sum } from './-money'

export async function listed(db: Db, scope: Scope) {
  const rows = await movements(db, scope)
  return { rows, ...(await months(db, rows)) }
}

export const kinds = { trade: 'Exchange', fee: 'Fee', income: 'Income', transfer: 'Transfer' }

export function lastMonths() {
  const now = new Date()
  return Array.from({ length: 12 }, (_, index) => {
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1)
    return { key: new Date(start).toISOString().slice(0, 7), label: monthShort(start) }
  })
}

export const tileOf = (
  merchant: { kind: MerchantKind } | undefined,
  category: { icon: CategoryIcon } | undefined,
) => {
  const icon = merchant ? kindIcons[merchant.kind] : category && icons[category.icon]
  return icon ? { hue: category ? hues[category.icon] : ('gray' as const), icon } : null
}

type Listing = Awaited<ReturnType<typeof listed>>

type Named = { id: string; name: string; icon: CategoryIcon }

const sliced = (byCategory: ReadonlyMap<string, Named>, spent: Record<string, number>) =>
  Object.entries(spent).flatMap(([id, value]) => {
    const category = byCategory.get(id)
    return value > 0
      ? [
          {
            key: id,
            label: category?.name ?? 'No category',
            hue: category ? hues[category.icon] : ('gray' as const),
            value,
          },
        ]
      : []
  })

type Totals = Listing['totals']

export const monthly = (byCategory: ReadonlyMap<string, Named>, totals: Totals) =>
  lastMonths().map(({ key, label }) => ({
    label,
    slices: sliced(byCategory, totals[key]?.categories ?? {}),
  }))

export function recent(
  byCategory: ReadonlyMap<string, Named>,
  totals: Totals,
  rows: readonly Movement[],
) {
  const span = lastMonths()
  const spent: Record<string, number> = {}
  for (const { key } of span)
    for (const [id, value] of Object.entries(totals[key]?.categories ?? {}))
      spent[id] = (spent[id] ?? 0) + value
  const slices = sliced(byCategory, spent).filter(({ key }) => key)
  if (slices.length) return slices
  const since = span[0]?.key ?? ''
  const counts: Record<string, number> = {}
  let paired = 0
  for (const row of rows) {
    if (row.kind === 'trade' || monthOf(row.time) < since) continue
    if ('categoryId' in row.assignment)
      counts[row.assignment.categoryId] = (counts[row.assignment.categoryId] ?? 0) + 1
    else if (row.kind === 'transfer' && row.transfer.state === 'paired') paired++
  }
  return [
    ...sliced(byCategory, counts),
    ...(paired
      ? [{ key: 'transfer', label: 'Transfer', hue: 'brass' as const, value: paired }]
      : []),
  ]
}

type SummaryProps = {
  label: string
  total: number | undefined
  rows: readonly Movement[]
  currency: Listing['currency']
}

export function Summary({ label, total, rows, currency }: SummaryProps) {
  const money = (amount: number) => <Money value={{ amount, currency }} />
  const last = rows[0]?.time
  return (
    <Card>
      <div className="grid grid-cols-4 gap-4">
        {total !== undefined && <Stat label={label} value={money(total)} />}
        <Stat label="Movements" value={quantity(rows.length)} />
        {total !== undefined && (
          <Stat label="Average" value={rows.length ? money(total / rows.length) : dash} />
        )}
        <Stat label="Last seen" value={last ? date(last) : dash} />
      </div>
    </Card>
  )
}

type SpendingProps = Pick<Listing, 'totals' | 'currency'> & { fit?: boolean }

export function Spending({ totals, currency, fit = false }: SpendingProps) {
  const { byCategory } = root.useLoaderData()
  return (
    <Card title="Spending by month">
      <BlendChart
        columns={monthly(byCategory, totals)}
        format={(amount) => <Money value={{ amount, currency }} />}
        fit={fit}
      />
    </Card>
  )
}

type Props = Listing & { accounts?: boolean; open?: boolean }

export function Movements({ rows, currency, totals, accounts, open }: Props) {
  const { accounts: names, merchants, byCategory } = root.useLoaderData()
  const { columns, group, fold } = useMemo(() => {
    const byMerchant = new Map(merchants.map((merchant) => [merchant.id, merchant]))
    const categoryOf = (row: Movement) =>
      row.kind !== 'trade' && 'categoryId' in row.assignment
        ? byCategory.get(row.assignment.categoryId)
        : undefined
    const merchantOf = (row: Movement) =>
      row.kind !== 'trade' && row.identity.state === 'linked'
        ? byMerchant.get(row.identity.merchantId)
        : undefined
    const text = (row: Movement) => merchantOf(row)?.name ?? row.memo ?? kinds[row.kind]
    const peerOf = (row: Movement) => {
      if (row.kind !== 'transfer') return undefined
      const { transfer, quantity } = row
      const other = peer(transfer)
      if (!other) return undefined
      const label = `${quantity < 0n ? 'to' : 'from'} ${names.get(other.accountId)?.name ?? ''}`
      return transfer.state === 'paired' && transfer.via === 'user' ? (
        label
      ) : (
        <span className="text-dim">{transfer.state === 'proposed' ? `${label}?` : label}</span>
      )
    }
    const figure = (label: string, amount = 0) => (
      <span className="flex gap-1.5">
        <span className="text-dim">{label}</span>
        <Money value={{ amount, currency }} />
      </span>
    )
    const columns: readonly Column<Movement>[] = [
      {
        id: 'movement',
        header: 'Movement',
        cell: (row) => {
          const merchant = merchantOf(row)
          const memo = row.memo?.toLowerCase() === merchant?.name.toLowerCase() ? null : row.memo
          const tile = tileOf(merchant, categoryOf(row))
          return (
            <span className="flex min-w-0 items-center gap-3">
              {tile ? <Tile {...tile} size="sm" /> : <Blank />}
              <span className="flex min-w-0 gap-2">
                {merchant ? (
                  <Link
                    to="/merchants/$merchantId"
                    params={{ merchantId: merchant.id }}
                    className="truncate font-medium transition hover:text-dim"
                  >
                    {merchant.name}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{text(row)}</span>
                )}
                <span className="truncate text-dim">
                  {[
                    merchant && memo,
                    row.memo && row.kind !== 'transfer' ? kinds[row.kind] : null,
                    row.note,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </span>
            </span>
          )
        },
        sort: (row) => text(row).toLowerCase(),
        width: 'fill',
      },
      ...(accounts
        ? [
            {
              id: 'account',
              header: 'Account',
              cell: ({ accountId }: Movement) => names.get(accountId)?.name,
              sort: ({ accountId }: Movement) => names.get(accountId)?.name.toLowerCase() ?? '',
            },
          ]
        : []),
      {
        id: 'category',
        header: 'Category',
        cell: (row) =>
          row.kind !== 'trade' && (peerOf(row) ?? <Assigned assignment={row.assignment} plain />),
        sort: (row) => categoryOf(row)?.name.toLowerCase() ?? '',
      },
      {
        id: 'date',
        header: 'Date',
        cell: ({ time }) =>
          timed(time) ? (
            <Tooltip label={moment(time)}>
              <span>{day(time)}</span>
            </Tooltip>
          ) : (
            day(time)
          ),
        sort: ({ time }) => time,
      },
      {
        id: 'amount',
        header: 'Amount',
        cell: ({ assetId, quantity }) => (
          <span className={quantity > 0n ? 'text-positive' : ''}>{sum(assetId, quantity)}</span>
        ),
        sort: ({ quantity }) => units(quantity, scale),
        end: true,
      },
    ]
    const group: Group<Movement> = {
      by: 'date',
      of: ({ time }) => monthOf(time),
      head: (key, inside) => {
        const total = totals[key]
        const slices = sliced(byCategory, total?.categories ?? {})
        const proposed = inside.filter(
          (row) => row.kind === 'transfer' && row.transfer.state === 'proposed',
        ).length
        return (
          <span className="flex w-full items-center justify-between gap-4">
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{month(Date.parse(`${key}-01`))}</span>
              <span className="flex gap-4">
                {figure('Spent', total?.spent)}
                {figure('In', total?.in)}
                {figure('Out', total?.out)}
                {proposed > 0 && <span className="text-dim">{plural(proposed, 'proposal')}</span>}
              </span>
            </span>
            {slices.length > 0 && <Ring slices={slices} />}
          </span>
        )
      },
    }
    const fold: Fold<Movement> = {
      when: (row) => internal(row, categoryOf(row)?.type),
      label: (count) => plural(count, 'transfer'),
    }
    return { columns, group, fold }
  }, [names, merchants, byCategory, accounts, currency, totals])

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={({ accountId, ref, assetId }) => `${accountId} ${ref} ${assetId}`}
      initial={{ id: 'date', desc: true }}
      group={group}
      {...(!open && { fold })}
      actions={{ items: movementCommands, button: 'Movement actions' }}
    />
  )
}

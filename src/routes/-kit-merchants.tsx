import { useState } from 'react'
import { date, local } from '../core/format'
import type { MerchantKind } from '../data/merchants'
import { Card } from '../ui/card'
import { BlendChart } from '../ui/charts/blend'
import { type Column, DataTable } from '../ui/data-table'
import { Section, Stat } from '../ui/page'
import { Picker } from '../ui/picker'
import { Label } from '../ui/table'
import { Tile } from '../ui/tile'
import { kindIcons } from './-categories'
import { internal, type Movement, movements } from './-kit-tables'
import { Money } from './-money'

const kindOf: Readonly<Record<string, MerchantKind>> = {
  'Pingo Doce': 'supermarket',
  Continente: 'supermarket',
  Lidl: 'supermarket',
  'Time Out Market': 'restaurant',
  Starbucks: 'cafe',
  'Honest Greens': 'restaurant',
  Uber: 'taxi',
  Bolt: 'taxi',
  'Metro Lisboa': 'transit',
  Amazon: 'marketplace',
  IKEA: 'shop',
  Zara: 'shop',
  Netflix: 'streaming',
  Spotify: 'streaming',
  Steam: 'games',
  GitHub: 'software',
  Figma: 'software',
  Linear: 'software',
  'Farmacia Central': 'pharmacy',
  CUF: 'clinic',
  EDP: 'utility',
  EPAL: 'utility',
  MEO: 'telecom',
  'Booking.com': 'travel',
  'TAP Air Portugal': 'airline',
  Airbnb: 'hotel',
  'Acme Payroll': 'employer',
}

type Merchant = {
  name: string
  kind: MerchantKind
  first: Movement
  movements: readonly Movement[]
  total: number
  last: number
}

const merchants: readonly Merchant[] = [
  ...Map.groupBy(
    movements.filter((row) => !internal(row)),
    ({ party }) => party,
  ),
].flatMap(([name, list]) => {
  const [first] = list
  return first
    ? [
        {
          name,
          kind: kindOf[name] ?? 'services',
          first,
          movements: list,
          total: list.reduce((sum, { amount }) => sum + amount, 0),
          last: Math.max(...list.map(({ time }) => time)),
        },
      ]
    : []
})

const tile = ({ first, kind }: Merchant) => (
  <Tile hue={first.kind.hue} icon={kindIcons[kind]} size="sm" />
)

const total = (value: number) => (
  <span className={value > 0 ? 'text-positive' : ''}>
    <Money value={value} />
  </span>
)

const rest: readonly Column<Merchant>[] = [
  {
    id: 'category',
    header: 'Category',
    cell: ({ first }) => first.kind.name,
    sort: ({ first }) => first.kind.name.toLowerCase(),
  },
  {
    id: 'movements',
    header: 'Movements',
    cell: ({ movements }) => movements.length,
    sort: ({ movements }) => movements.length,
    width: 'sm',
    end: true,
  },
  {
    id: 'spent',
    header: 'Total',
    cell: ({ total: value }) => total(value),
    sort: ({ total: value }) => -value,
    end: true,
  },
  { id: 'last', header: 'Last seen', cell: ({ last }) => date(last), sort: ({ last }) => last },
]

const withIcons: readonly Column<Merchant>[] = [
  {
    id: 'merchant',
    header: 'Merchant',
    cell: (merchant) => (
      <span className="flex min-w-0 items-center gap-3">
        {tile(merchant)}
        <Label text={merchant.name} note={merchant.kind} />
      </span>
    ),
    sort: ({ name }) => name.toLowerCase(),
    width: 'fill',
  },
  ...rest,
]

const withoutIcons: readonly Column<Merchant>[] = [
  {
    id: 'merchant',
    header: 'Merchant',
    cell: ({ name, kind }) => <Label text={name} note={kind} />,
    sort: ({ name }) => name.toLowerCase(),
    width: 'fill',
  },
  ...rest,
]

const history: readonly Column<Movement>[] = [
  { id: 'date', header: 'Date', cell: ({ time }) => local(time), sort: ({ time }) => time },
  {
    id: 'text',
    header: 'Bank text',
    cell: ({ party }) => party.toUpperCase(),
    width: 'fill',
  },
  {
    id: 'account',
    header: 'Account',
    cell: ({ account }) => account,
    sort: ({ account }) => account,
    width: 'lg',
  },
  {
    id: 'amount',
    header: 'Amount',
    cell: ({ amount }) => total(amount),
    sort: ({ amount }) => amount,
    end: true,
  },
]

const months = Array.from({ length: 12 }, (_, index) => Date.UTC(2025, 10 + index, 1))
const short = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

function Merchant({ merchant }: { merchant: Merchant }) {
  const { name, kind, first, movements: list, total: value, last } = merchant
  const columns = months.map((start, index) => {
    const end = months[index + 1] ?? Number.POSITIVE_INFINITY
    const sum = list
      .filter(({ time }) => time >= start && time < end)
      .reduce((all, { amount }) => all + Math.abs(amount), 0)
    return {
      label: short.format(start),
      slices: sum ? [{ key: name, label: first.kind.name, hue: first.kind.hue, value: sum }] : [],
    }
  })
  return (
    <>
      <header className="flex items-center gap-3">
        <Tile hue={first.kind.hue} icon={kindIcons[kind]} size="lg" />
        <span className="flex flex-col">
          <span className="text-heading">{name}</span>
          <span className="text-dim">
            {kind}, {first.kind.name}
          </span>
        </span>
      </header>
      <Card>
        <div className="grid grid-cols-4 gap-4">
          <Stat label="Total" value={total(value)} />
          <Stat label="Movements" value={list.length} />
          <Stat label="Average" value={total(value / list.length)} />
          <Stat label="Last seen" value={date(last)} />
        </div>
      </Card>
      <Card title="By month" description="The last 12 months">
        <BlendChart columns={columns} format={(sum) => <Money value={sum} />} />
      </Card>
      <Section title="Movements">
        <DataTable
          columns={history}
          rows={list}
          rowKey={({ id }) => id}
          density="compact"
          initial={{ id: 'date', desc: true }}
        />
      </Section>
    </>
  )
}

export function KitMerchants() {
  const [picked, pick] = useState(merchants.toSorted((a, b) => a.total - b.total)[0]?.name)
  const merchant = merchants.find(({ name }) => name === picked)
  return (
    <>
      <Section title="Merchants, with kind icons">
        <DataTable
          columns={withIcons}
          rows={merchants}
          rowKey={({ name }) => name}
          initial={{ id: 'spent', desc: true }}
        />
      </Section>
      <Section title="Merchants, without icons">
        <DataTable
          columns={withoutIcons}
          rows={merchants}
          rowKey={({ name }) => name}
          density="compact"
          initial={{ id: 'spent', desc: true }}
        />
      </Section>
      <Section
        title="Merchant page"
        action={
          <Picker
            label={picked ?? ''}
            items={merchants.map(({ name }) => ({ id: name, label: name, run: () => pick(name) }))}
          />
        }
      >
        {merchant && <Merchant key={merchant.name} merchant={merchant} />}
      </Section>
    </>
  )
}

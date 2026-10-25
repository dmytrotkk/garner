import { date, local, month, plural } from '../core/format'
import { Ring } from '../ui/charts/ring'
import { type Column, DataTable, type Fold, type Group } from '../ui/data-table'
import { Section } from '../ui/page'
import { Label } from '../ui/table'
import { Tile } from '../ui/tile'
import { icons } from './-categories'
import type { Seed } from './-kit-hues'
import { Money } from './-money'

type List<Item> = readonly [Item, ...Item[]]

type Kind = Seed & { parties: List<string>; low: number; high: number }

export type Movement = {
  id: string
  time: number
  party: string
  kind: Kind
  account: string
  amount: number
}

const kinds: List<Kind> = [
  {
    name: 'Groceries',
    icon: 'basket',
    hue: 'lime',
    parties: ['Pingo Doce', 'Continente', 'Lidl'],
    low: 8,
    high: 90,
  },
  {
    name: 'Eating out',
    icon: 'restaurant',
    hue: 'orange',
    parties: ['Time Out Market', 'Starbucks', 'Honest Greens'],
    low: 6,
    high: 45,
  },
  {
    name: 'Transport',
    icon: 'bus',
    hue: 'blue',
    parties: ['Uber', 'Bolt', 'Metro Lisboa'],
    low: 2,
    high: 25,
  },
  {
    name: 'Shopping',
    icon: 'bag',
    hue: 'yellow',
    parties: ['Amazon', 'IKEA', 'Zara'],
    low: 10,
    high: 250,
  },
  {
    name: 'Entertainment',
    icon: 'ticket',
    hue: 'pink',
    parties: ['Netflix', 'Spotify', 'Steam'],
    low: 5,
    high: 20,
  },
  {
    name: 'Software',
    icon: 'cloud',
    hue: 'purple',
    parties: ['GitHub', 'Figma', 'Linear'],
    low: 8,
    high: 60,
  },
  {
    name: 'Health',
    icon: 'medicine',
    hue: 'red',
    parties: ['Farmacia Central', 'CUF'],
    low: 5,
    high: 80,
  },
  {
    name: 'Utilities',
    icon: 'plug',
    hue: 'amber',
    parties: ['EDP', 'EPAL', 'MEO'],
    low: 30,
    high: 120,
  },
  {
    name: 'Travel',
    icon: 'plane',
    hue: 'teal',
    parties: ['Booking.com', 'TAP Air Portugal', 'Airbnb'],
    low: 60,
    high: 600,
  },
]

const salary: Kind = {
  name: 'Salary',
  icon: 'briefcase',
  hue: 'green',
  parties: ['Acme Payroll'],
  low: 3_200,
  high: 3_200,
}

const pocket: Kind = {
  name: 'Transfers',
  icon: 'transfer',
  hue: 'gray',
  parties: ['To Savings'],
  low: 0.01,
  high: 0.99,
}

export const internal = ({ kind }: Movement) => kind === pocket

const accounts: List<string> = [
  'Revolut Main',
  'Wise Travel',
  'Starling Bills',
  'Santander Current',
]

let state = 42
const random = () => {
  state = (state * 1_664_525 + 1_013_904_223) >>> 0
  return state / 2 ** 32
}
const pick = <Item,>(items: List<Item>) => items[Math.floor(random() * items.length)] ?? items[0]

const start = Date.UTC(2026, 9, 6)

export const movements: readonly Movement[] = Array.from({ length: 10_000 }, (_, index) => {
  const kind = index % 280 === 0 ? salary : index % 3 === 1 ? pocket : pick(kinds)
  const size = kind.low + random() * (kind.high - kind.low)
  return {
    id: String(index),
    time: start - index * 9_360_000,
    party: pick(kind.parties),
    kind,
    account: pick(accounts),
    amount: ((kind === salary ? 1 : -1) * Math.round(size * 100)) / 100,
  }
})

const by = {
  party: ({ party }: Movement) => party.toLowerCase(),
  category: ({ kind }: Movement) => kind.name.toLowerCase(),
  account: ({ account }: Movement) => account.toLowerCase(),
  time: ({ time }: Movement) => time,
  amount: ({ amount }: Movement) => amount,
}

const amount: Column<Movement> = {
  id: 'amount',
  header: 'Amount',
  cell: ({ amount }) => (
    <span className={amount > 0 ? 'text-positive' : ''}>
      <Money value={amount} />
    </span>
  ),
  sort: by.amount,
  end: true,
}

const when: Column<Movement> = {
  id: 'date',
  header: 'Date',
  cell: ({ time }) => date(time),
  sort: by.time,
}

const category: Column<Movement> = {
  id: 'category',
  header: 'Category',
  cell: ({ kind }) => kind.name,
  sort: by.category,
}

const account: Column<Movement> = {
  id: 'account',
  header: 'Account',
  cell: ({ account }) => account,
  sort: by.account,
  width: 'lg',
}

const variants = [
  {
    density: 'comfortable',
    title: 'Comfortable, 40px',
    columns: [
      {
        id: 'party',
        header: 'Movement',
        cell: ({ party, kind, account }) => (
          <span className="flex min-w-0 items-center gap-3">
            <Tile hue={kind.hue} icon={icons[kind.icon]} size="sm" />
            <Label text={party} note={account} />
          </span>
        ),
        sort: by.party,
        width: 'fill',
      },
      category,
      when,
      amount,
    ],
  },
  {
    density: 'compact',
    title: 'Compact, 32px, no icons',
    columns: [
      {
        id: 'party',
        header: 'Movement',
        cell: ({ party }) => party,
        sort: by.party,
        width: 'fill',
      },
      category,
      account,
      when,
      amount,
    ],
  },
  {
    density: 'dense',
    title: 'Dense, 28px',
    columns: [
      { id: 'date', header: 'Date', cell: ({ time }) => local(time), sort: by.time, width: 'sm' },
      {
        id: 'party',
        header: 'Movement',
        cell: ({ party }) => party,
        sort: by.party,
        width: 'fill',
      },
      category,
      account,
      amount,
    ],
  },
] as const satisfies readonly {
  density: 'comfortable' | 'compact' | 'dense'
  title: string
  columns: readonly Column<Movement>[]
}[]

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const ledger: readonly Column<Movement>[] = [
  {
    id: 'party',
    header: 'Movement',
    cell: ({ party, kind }) => (
      <span className="flex min-w-0 items-center gap-3">
        <Tile hue={kind.hue} icon={icons[kind.icon]} size="sm" />
        <Label text={party} note={`${party.toUpperCase()} LISBOA`} />
      </span>
    ),
    sort: by.party,
    width: 'fill',
  },
  {
    id: 'category',
    header: 'Category',
    cell: ({ id, kind }) => <span className={Number(id) % 3 ? '' : 'text-dim'}>{kind.name}</span>,
    sort: by.category,
  },
  { id: 'date', header: 'Date', cell: ({ time }) => day.format(time), sort: by.time },
  amount,
]

const total = (rows: readonly Movement[]) => rows.reduce((sum, { amount }) => sum + amount, 0)

function Month({ label, rows }: { label: string; rows: readonly Movement[] }) {
  const spending = rows.filter((row) => row.amount < 0 && !internal(row))
  const out = -total(spending)
  const slices = [...Map.groupBy(spending, ({ kind }) => kind)].map(([kind, list]) => ({
    key: kind.name,
    label: kind.name,
    hue: kind.hue,
    value: -total(list),
  }))
  const stats = [
    ['Spent', out],
    ['In', total(rows) + out],
    ['Out', out],
  ] as const
  return (
    <span className="flex w-full items-center justify-between gap-4">
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="flex gap-4">
          {stats.map(([name, value]) => (
            <span key={name} className="flex gap-1.5">
              <span className="text-dim">{name}</span>
              <Money value={value} />
            </span>
          ))}
        </span>
      </span>
      <Ring slices={slices} />
    </span>
  )
}

const folded: Fold<Movement> = { when: internal, label: (count) => plural(count, 'transfer') }

const monthly: Group<Movement> = {
  by: 'date',
  of: ({ time }) => month(time),
  head: (label, rows) => <Month label={label} rows={rows} />,
}

export function KitTables() {
  return [
    <Section key="months" title="Movements by month">
      <DataTable
        columns={ledger}
        rows={movements}
        rowKey={({ id }) => id}
        initial={{ id: 'date', desc: true }}
        group={monthly}
        fold={folded}
      />
    </Section>,
    ...variants.map(({ density, title, columns }) => (
      <Section key={density} title={title}>
        <DataTable
          columns={columns}
          rows={movements}
          rowKey={({ id }) => id}
          density={density}
          initial={{ id: 'date', desc: true }}
        />
      </Section>
    )),
  ]
}

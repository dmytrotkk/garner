import type { CategoryIcon } from '../data/categories'
import { Card } from '../ui/card'
import { BlendChart, type Slice } from '../ui/charts/blend'
import { type Hue, hues } from '../ui/hues'
import { MeshCard } from '../ui/mesh-card'
import { Stat } from '../ui/page'
import { Tile } from '../ui/tile'
import { icons } from './-categories'
import { glyphOf } from './-institutions'
import { Money } from './-money'

export type Seed = { name: string; icon: CategoryIcon; hue: Hue }

const seeds: readonly Seed[] = [
  { name: 'Groceries', icon: 'basket', hue: 'lime' },
  { name: 'Eating out', icon: 'restaurant', hue: 'orange' },
  { name: 'Housing', icon: 'home', hue: 'indigo' },
  { name: 'Utilities', icon: 'plug', hue: 'amber' },
  { name: 'Transport', icon: 'bus', hue: 'blue' },
  { name: 'Car', icon: 'car', hue: 'cyan' },
  { name: 'Travel', icon: 'plane', hue: 'teal' },
  { name: 'Shopping', icon: 'bag', hue: 'yellow' },
  { name: 'Health', icon: 'medicine', hue: 'red' },
  { name: 'Personal care', icon: 'scissor', hue: 'mint' },
  { name: 'Entertainment', icon: 'ticket', hue: 'pink' },
  { name: 'Software', icon: 'cloud', hue: 'purple' },
  { name: 'Education', icon: 'cap', hue: 'brown' },
  { name: 'Insurance', icon: 'shield', hue: 'gray' },
  { name: 'Taxes', icon: 'taxes', hue: 'gray' },
  { name: 'Fees', icon: 'invoice', hue: 'gray' },
  { name: 'Gifts', icon: 'gift', hue: 'rose' },
  { name: 'Cash', icon: 'atm', hue: 'green' },
  { name: 'Salary', icon: 'briefcase', hue: 'green' },
  { name: 'Freelance', icon: 'laptop', hue: 'mint' },
  { name: 'Interest', icon: 'percent', hue: 'teal' },
  { name: 'Rental income', icon: 'key', hue: 'lime' },
  { name: 'Other income', icon: 'receive', hue: 'green' },
  { name: 'Transfers', icon: 'transfer', hue: 'brass' },
  { name: 'Loans', icon: 'handshake', hue: 'brass' },
]

const iconOf = (hue: Hue) => icons[seeds.find((seed) => seed.hue === hue)?.icon ?? 'tag']

const variants = ['soft', 'solid'] as const

const spread: readonly Hue[] = [
  'red',
  'orange',
  'yellow',
  'lime',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
]

type Spend = Readonly<Record<string, number>>

const slices = (spend: Spend): Slice[] =>
  seeds.flatMap(({ name, hue }) => {
    const value = spend[name]
    return value ? [{ key: name, label: name, hue, value }] : []
  })

const week = (
  [
    ['Mon', { Groceries: 42, Transport: 6, Software: 12 }],
    ['Tue', { 'Eating out': 18, Transport: 6, Entertainment: 14 }],
    ['Wed', { Groceries: 28, 'Eating out': 34, Shopping: 25 }],
    ['Thu', { 'Eating out': 12, Transport: 24, Health: 19 }],
    ['Fri', { 'Eating out': 58, Transport: 9, Entertainment: 32 }],
    ['Sat', { Groceries: 64, 'Eating out': 41, Shopping: 89 }],
    ['Sun', { 'Eating out': 22, Entertainment: 18, Software: 10 }],
  ] as const
).map(([label, spend]) => ({ label, slices: slices(spend) }))

const year = [
  'Nov',
  'Dec',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
].map((label, month) => ({
  label,
  slices: slices({
    Groceries: 320 + 60 * Math.sin(month),
    'Eating out': 210 + 80 * Math.cos(month * 1.3),
    Utilities: 140 + 50 * Math.cos(month / 2),
    Transport: 90 + 30 * Math.sin(month * 2),
    Travel: [0, 600, 0, 0, 0, 0, 0, 0, 1_400, 0, 0, 0][month] ?? 0,
    Shopping: 180 + 140 * Math.max(0, Math.sin(month * 0.9 + 1)),
    Health: month % 4 ? 30 : 120,
    Entertainment: 70 + 30 * Math.sin(month * 1.7),
    Software: 60,
  }),
}))

const sum = (all: readonly Slice[]) => all.reduce((total, { value }) => total + value, 0)

const across = (columns: readonly { slices: readonly Slice[] }[]) =>
  slices(
    Object.fromEntries(
      [
        ...Map.groupBy(
          columns.flatMap((column) => column.slices),
          ({ key }) => key,
        ),
      ].map(([key, group]) => [key, sum(group)]),
    ),
  )

const total = sum(across(week))

const cards = [
  {
    label: 'This week',
    slices: across(week),
    institution: 'Revolut',
    account: 'Main',
    balance: 1_682.55,
  },
  {
    label: 'July',
    slices: across(year.slice(8, 9)),
    institution: 'Wise',
    account: 'Travel',
    balance: 4_120.4,
  },
  {
    label: 'December',
    slices: across(year.slice(1, 2)),
    institution: 'Starling',
    account: 'Bills',
    balance: 2_906.18,
  },
  {
    label: 'September',
    slices: across(year.slice(10, 11)),
    institution: 'Santander',
    account: 'Current account',
    balance: 937.02,
  },
]

const mixes: readonly Spend[] = [
  { Groceries: 45, 'Eating out': 30, Transport: 25 },
  { Housing: 50, Utilities: 20, Health: 15, Software: 15 },
  { Travel: 35, Shopping: 25, Entertainment: 15, 'Personal care': 15, Gifts: 10 },
  { Car: 45, Education: 30, Health: 25 },
  { 'Eating out': 40, Entertainment: 35, Travel: 25 },
  { Software: 40, Education: 25, Transport: 20, Gifts: 15 },
  { Shopping: 30, 'Personal care': 25, Health: 20, Utilities: 15, Car: 10 },
  { Housing: 55, Groceries: 30, Entertainment: 15 },
  { Salary: 50, Freelance: 20, Interest: 15, Groceries: 15 },
]

const money = (value: number) => <Money value={value} />

export function KitHues() {
  return (
    <>
      <Card title="Hues" description="Soft and solid tiles, vivid for charts">
        <div className="grid grid-cols-8 gap-y-5">
          {hues.map((hue) => (
            <div key={hue} className="flex flex-col items-center gap-2">
              <span className="flex gap-1.5">
                {variants.map((variant) => (
                  <Tile key={variant} hue={hue} icon={iconOf(hue)} variant={variant} />
                ))}
              </span>
              <span className="text-caption text-dim">{hue}</span>
            </div>
          ))}
        </div>
      </Card>
      {variants.map((variant) => (
        <Card key={variant} title="Categories" description={`The seeded categories, ${variant}`}>
          <div className="grid grid-cols-5 gap-x-4 gap-y-5">
            {seeds.map(({ name, icon, hue }) => (
              <div key={name} className="flex items-center gap-3">
                <Tile hue={hue} icon={icons[icon]} size="lg" variant={variant} />
                <span className="flex flex-col">
                  <span className="font-medium">{name}</span>
                  <span className="text-caption text-dim">{hue}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      ))}
      <Card title="Sizes" description="20px in rows, 32px in lists, 48px as a header">
        <div className="flex flex-col gap-4">
          {(['sm', 'md', 'lg'] as const).flatMap((size) =>
            variants.map((variant) => (
              <div key={size + variant} className="flex items-center gap-2">
                {seeds.slice(0, 12).map(({ name, icon, hue }) => (
                  <Tile key={name} hue={hue} icon={icons[icon]} size={size} variant={variant} />
                ))}
              </div>
            )),
          )}
        </div>
      </Card>
      <Card title="Cards" description="Colors split by each category's share, hover to tilt">
        <div className="grid grid-cols-2 gap-6">
          {cards.map(({ label, slices, institution, account, balance }) => (
            <div key={label} className="flex flex-col gap-3">
              <MeshCard
                slices={slices}
                name={account}
                face={{
                  glyph: glyphOf({ name: institution, accounts: [] }),
                  balance: <Money value={balance} />,
                }}
              />
              <span className="flex justify-between">
                <span className="text-dim">{label}</span>
                <Money value={sum(slices)} />
              </span>
            </div>
          ))}
        </div>
      </Card>
      <Card
        title="Every hue"
        description="Ten hues around the wheel, one spot each, the most the mesh takes"
      >
        <MeshCard slices={spread.map((hue) => ({ hue, value: 1 }))} name="All categories" />
      </Card>
      {mixes.map((spend) => {
        const name = Object.keys(spend).join(', ')
        return (
          <Card
            key={name}
            title={name}
            description={Object.values(spend)
              .map((share) => `${share}%`)
              .join(', ')}
          >
            <MeshCard slices={slices(spend)} name={name} />
          </Card>
        )
      })}
      <Card>
        <Stat label="Spent this week" value={<Money value={total} />} />
        <BlendChart columns={week} format={money} />
      </Card>
      <Card title="Spending by month" description="Each bar blends its categories by share">
        <BlendChart columns={year} format={money} />
      </Card>
    </>
  )
}

import {
  Add01Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { BarChart } from '../ui/charts/bar'
import { DonutChart } from '../ui/charts/donut'
import { LineChart } from '../ui/charts/line'
import { Drop } from '../ui/drop'
import { Icon } from '../ui/icon'
import { Notice } from '../ui/notice'
import { Page, Section } from '../ui/page'
import { type Column, Label, Table } from '../ui/table'
import { Tooltip } from '../ui/tooltip'
import { KitHues } from './-kit-hues'
import { KitMerchants } from './-kit-merchants'
import { KitScan } from './-kit-scan'
import { KitTables } from './-kit-tables'
import { KitUpdate } from './-kit-update'
import { KitWindow } from './-kit-window'
import { Amount, Money, useScale } from './-money'
import { useNotices } from './-notices'

export const Route = createFileRoute('/kit')({ component: Kit })

type Row = { symbol: string; name: string; usd: number; amount: number }

const rows: readonly Row[] = [
  { symbol: 'ETH', name: 'Ethereum', usd: 2_500, amount: 4 },
  { symbol: 'LINK', name: 'Chainlink', usd: 15, amount: 400 },
  { symbol: 'USDC', name: 'USD Coin', usd: 1, amount: 3_000 },
  { symbol: 'BTC', name: 'Bitcoin', usd: 60_000, amount: 0.05 },
]

const columns: readonly Column<Row>[] = [
  { header: 'Asset', cell: ({ symbol, name }) => <Label text={symbol} note={name} /> },
  { header: 'Price', cell: ({ usd }) => <Money value={usd} format="price" /> },
  { header: 'Amount', cell: ({ amount }) => <Amount value={amount} /> },
  { header: 'Value', cell: ({ usd, amount }) => <Money value={usd * amount} /> },
]

const day = 86_400_000
const start = Date.UTC(2026, 2, 25)
const months = new Intl.DateTimeFormat('en-US', { month: 'short' })

const daily = Array.from({ length: 180 }, (_, index) => {
  const crypto = 48_000 + index * 55 + 7_000 * Math.sin(index / 19) + 2_600 * Math.sin(index / 5)
  return {
    time: start + index * day,
    crypto,
    fiat: crypto * 0.35 + 2_400 * Math.cos(index / 24),
  }
})

const monthly = [...Map.groupBy(daily, ({ time }) => months.format(time))].map(
  ([month, points]) => ({
    month,
    crypto: points.reduce((sum, point) => sum + point.crypto, 0) / points.length,
    fiat: points.reduce((sum, point) => sum + point.fiat, 0) / points.length,
  }),
)

const allocation = [
  { key: 'eth', label: 'ETH', value: 10_000 },
  { key: 'link', label: 'LINK', value: 6_000 },
  { key: 'usdc', label: 'USDC', value: 3_000 },
  { key: 'btc', label: 'BTC', value: 3_000 },
  { key: 'other', label: 'Other', value: 1_000 },
]

const crypto = [{ key: 'crypto', label: 'Crypto' }]
const both = [...crypto, { key: 'fiat', label: 'Fiat' }]
const money = (value: number) => <Money value={value} />

function Kit() {
  const line = { data: daily, x: 'time', scale: useScale('USD'), format: money } as const
  const [dropped, setDropped] = useState(false)
  return (
    <Page title="Kit" notices={useNotices()}>
      <Card
        title="Drop"
        description="The overlay shown while files are dragged over the window. It takes no clicks, so the same button hides it."
      >
        <span>
          <Button variant="secondary" onClick={() => setDropped(!dropped)}>
            {dropped ? 'Hide drop' : 'Show drop'}
          </Button>
        </span>
      </Card>
      <Drop open={dropped} into={undefined} />
      <KitUpdate />
      <KitScan />
      <KitWindow />
      <KitMerchants />
      <KitTables />
      <KitHues />
      {(['md', 'sm'] as const).map((size) => (
        <div key={size} className="flex items-center gap-3">
          <Button size={size}>Primary</Button>
          <Button size={size} variant="secondary">
            Secondary
          </Button>
          <Button size={size} variant="ghost">
            Ghost
          </Button>
          <Button size={size} disabled>
            Disabled
          </Button>
          <Tooltip label="Add institution">
            <Button size={size} variant="secondary">
              <Icon icon={Add01Icon} />
              With icon
            </Button>
          </Tooltip>
        </div>
      ))}
      <Section title="Notices">
        <div className="flex flex-col gap-3">
          <Notice
            icon={InformationCircleIcon}
            title="Neutral"
            text="Icon, title, text, action."
            action={
              <Button size="sm" variant="secondary">
                Review
              </Button>
            }
          />
          <Notice tone="positive" icon={CheckmarkCircle02Icon} title="Positive, title only" />
          <Notice tone="warning" icon={Alert02Icon} title="Warning" text="Tone colors the icon." />
          <Notice
            tone="negative"
            icon={Alert02Icon}
            title="Negative"
            text="Sync failed."
            action={
              <Button size="sm" variant="secondary">
                <Icon icon={RefreshIcon} />
                Retry
              </Button>
            }
          />
        </div>
      </Section>
      <Card title="Net worth" description="Type scale and the positive tone">
        <p className="text-title">$123,456.79</p>
        <p className="text-positive">+2.4%</p>
      </Card>
      <Section title="Holdings">
        <Table
          columns={columns}
          rows={rows}
          rowKey={({ symbol }) => symbol}
          link={() => ({ to: '/kit' })}
        />
      </Section>
      <Card title="Net worth" description="Dotted fill">
        <LineChart {...line} series={crypto} fill="dotted" />
      </Card>
      <Card title="Net worth" description="Hatched fill">
        <LineChart {...line} series={crypto} fill="hatched" />
      </Card>
      <Card title="Net worth" description="Line only">
        <LineChart {...line} series={crypto} />
      </Card>
      <Card title="Crypto and fiat" description="Two lines, click the legend to isolate one">
        <LineChart {...line} series={both} />
      </Card>
      <Card title="Crypto and fiat" description="Stacked areas">
        <LineChart {...line} series={both} fill="dotted" stacked />
      </Card>
      <Card title="Monthly average" description="Duotone bars">
        <BarChart data={monthly} x="month" series={crypto} duotone format={money} />
      </Card>
      <Card title="Monthly average" description="Stacked bars">
        <BarChart data={monthly} x="month" series={both} stacked format={money} />
      </Card>
      <Card title="Allocation" description="Donut">
        <DonutChart slices={allocation} format={money} />
      </Card>
    </Page>
  )
}

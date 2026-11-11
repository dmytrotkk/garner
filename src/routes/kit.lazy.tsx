import {
  Add01Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { createLazyFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../ui/button.tsx'
import { Card } from '../ui/card.tsx'
import { LineChart } from '../ui/charts/line.tsx'
import { Drop } from '../ui/drop.tsx'
import { type Column, Label } from '../ui/grid.tsx'
import { Icon } from '../ui/icon.tsx'
import { Notice } from '../ui/notice.tsx'
import { Page, Section } from '../ui/page.tsx'
import { Table } from '../ui/table.tsx'
import { Tooltip } from '../ui/tooltip.tsx'
import { KitHues } from './-kit-hues.tsx'
import { KitMerchants } from './-kit-merchants.tsx'
import { KitScan } from './-kit-scan.tsx'
import { KitTables } from './-kit-tables.tsx'
import { KitUpdate } from './-kit-update.tsx'
import { KitWindow } from './-kit-window.tsx'
import { Amount, Money, useScale } from './-money.tsx'
import { useNotices } from './-notices.tsx'

export const Route = createLazyFileRoute('/kit')({ component: Kit })

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
const daily = Array.from({ length: 180 }, (_, index) => ({
  time: start + index * day,
  value: 48_000 + index * 55 + 7_000 * Math.sin(index / 19) + 2_600 * Math.sin(index / 5),
}))

const money = (value: number) => <Money value={value} />

function Kit() {
  const scale = useScale('USD')
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
        <LineChart data={daily} x="time" y="value" label="Net worth" scale={scale} format={money} />
      </Card>
    </Page>
  )
}

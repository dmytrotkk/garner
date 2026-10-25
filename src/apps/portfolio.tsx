import { useApp } from '@modelcontextprotocol/ext-apps/react'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Portfolio } from '../ai/tools'
import { dash, money, quantity } from '../core/format'
import { Section, Stat } from '../ui/page'
import { type Column, Label, Table } from '../ui/table'
import { asset, provideIcons } from '../ui/token'
import '../ui/tokens.css'

type Holding = Portfolio['holdings'][number]
type Institution = Portfolio['institutions'][number]

function View({ total, institutions, holdings, display }: Portfolio) {
  const shown = (value: number | null, format?: 'price') =>
    value === null ? dash : money(value * display.rate, display.currency, format)
  const assets: readonly Column<Holding>[] = [
    asset,
    { header: 'Price', cell: ({ price }) => shown(price, 'price') },
    {
      header: 'Amount',
      cell: ({ id, amount }) =>
        id.startsWith('fiat:') ? money(amount, id.slice('fiat:'.length)) : quantity(amount),
    },
    { header: 'Value', cell: ({ value }) => shown(value) },
  ]
  const groups: readonly Column<Institution>[] = [
    { header: 'Institution', cell: ({ name }) => <Label text={name} /> },
    { header: 'Accounts', cell: ({ accounts }) => accounts.length },
    { header: 'Value', cell: ({ value }) => shown(value) },
  ]
  return (
    <div className="flex flex-col gap-6 p-1">
      <Stat label="Net worth" value={shown(total)} />
      <Section title="Holdings">
        <Table columns={assets} rows={holdings} rowKey={({ id }) => id} />
      </Section>
      <Section title="Institutions">
        <Table columns={groups} rows={institutions} rowKey={({ id }) => id} />
      </Section>
    </div>
  )
}

function App() {
  const [portfolio, setPortfolio] = useState<Portfolio>()
  useApp({
    appInfo: { name: 'garner', version: '1' },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = ({ structuredContent, _meta }) => {
        const icons = (_meta as { icons?: Record<string, string> } | undefined)?.icons ?? {}
        provideIcons(async (id) => icons[id] ?? null)
        setPortfolio(structuredContent as Portfolio)
      }
    },
  })
  return portfolio ? <View {...portfolio} /> : null
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
createRoot(root).render(<App />)

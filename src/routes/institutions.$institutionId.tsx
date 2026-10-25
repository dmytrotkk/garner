import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useState } from 'react'
import { latest, monthAt, period } from '../data/cashflow'
import { history } from '../data/history'
import { imports } from '../data/imports'
import { movements } from '../data/ledger'
import { months, valuation } from '../data/spending'
import { Actions } from '../ui/actions'
import { BlendChart } from '../ui/charts/blend'
import { menuOn } from '../ui/menu'
import { MeshCard } from '../ui/mesh-card'
import { Page, Section } from '../ui/page'
import { Segmented } from '../ui/segmented'
import { Table } from '../ui/table'
import { Cashflow } from './-cashflow'
import { accountCommands, importCommands, institutionCommands } from './-commands'
import { root } from './-data'
import { History } from './-history'
import { glyphOf } from './-institutions'
import { Money } from './-money'
import { monthly, recent } from './-movements'
import { useNotices } from './-notices'

export const Route = createFileRoute('/institutions/$institutionId')({
  loader: async ({ context: { db }, params, parentMatchPromise }) => {
    const [{ loaderData }, files, past, rows] = await Promise.all([
      parentMatchPromise,
      imports(db, params.institutionId),
      history(db, { institutionId: params.institutionId }),
      movements(db, { institutionId: params.institutionId }),
    ])
    const institution = loaderData?.institutions.find(({ id }) => id === params.institutionId)
    if (!loaderData || !institution) throw notFound()
    const { byCategory } = loaderData
    const [spending, context, ...each] = await Promise.all([
      months(db, rows),
      valuation(db, rows),
      ...institution.accounts.map(async ({ id }) => {
        const mine = rows.filter((row) => row.accountId === id)
        const own = await months(db, mine)
        return [id, recent(byCategory, own.totals, mine)] as const
      }),
    ])
    return { institution, files, past, spending, rows, context, slices: new Map(each) }
  },
  component: InstitutionPage,
})

const charts = [
  { value: 'total', label: 'Total' },
  { value: 'spending', label: 'Spending' },
  { value: 'flow', label: 'Money flow' },
] as const

function InstitutionPage() {
  const { institution, files, past, spending, rows, context, slices } = Route.useLoaderData()
  const { byCategory } = root.useLoaderData()
  const [chart, show] = useState<(typeof charts)[number]['value']>('total')
  const commands = institutionCommands(institution)
  const add = commands.find(({ id }) => id.startsWith('add-account '))
  const rest = commands.filter((command) => command !== add)
  const notices = useNotices()
  const glyph = glyphOf(institution)

  return (
    <Page
      title={institution.name}
      action={<Actions label="Institution actions" primary={add} items={rest} />}
      notices={files.length ? notices : undefined}
    >
      <History
        label="Total"
        value={institution.value}
        history={past}
        action={<Segmented label="Chart" value={chart} options={charts} onChange={show} />}
      >
        {chart === 'spending' ? (
          <BlendChart
            columns={monthly(byCategory, spending.totals)}
            format={(amount) => <Money value={{ amount, currency: spending.currency }} />}
            bleed
          />
        ) : chart === 'flow' ? (
          <Cashflow
            rows={rows}
            context={context}
            scope={{ kind: 'institution', institutionId: institution.id }}
            initial={period('month', latest(rows) ?? monthAt(Date.now()))}
          />
        ) : undefined}
      </History>
      <Section
        title="Accounts"
        empty={
          !institution.accounts.length && 'No accounts yet. Add an address to start tracking it.'
        }
      >
        <div className="grid grid-cols-3 gap-4">
          {institution.accounts.map((account) => {
            const own = slices.get(account.id) ?? []
            return (
              <Link
                key={account.id}
                to="/accounts/$accountId"
                params={{ accountId: account.id }}
                className="rounded-surface"
                {...menuOn(accountCommands(account))}
              >
                <MeshCard
                  slices={own.length ? own : [{ hue: 'gray', value: 1 }]}
                  name={account.name}
                  face={{ glyph, balance: <Money value={account.value} /> }}
                />
              </Link>
            )
          })}
        </div>
      </Section>
      {files.length > 0 && (
        <Section title="Imports">
          <Table
            columns={[{ header: 'File', cell: ({ name }) => name }]}
            rows={files}
            rowKey={({ id }) => id}
            actions={{ items: importCommands, button: 'Import actions' }}
          />
        </Section>
      )}
    </Page>
  )
}

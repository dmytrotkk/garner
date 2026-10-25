import { createFileRoute, notFound } from '@tanstack/react-router'
import { useState } from 'react'
import { monthAt, trailing } from '../data/cashflow'
import { flows, proposals, routes } from '../data/flows'
import { history } from '../data/history'
import { savedRoutes } from '../data/transfers'
import { Page, Section } from '../ui/page'
import { Segmented } from '../ui/segmented'
import { Cashflow } from './-cashflow'
import { root } from './-data'
import { Proposals, Transfers } from './-flows'
import { History } from './-history'
import { Institutions } from './-institutions'
import { lastMonths } from './-movements'
import { useNotices } from './-notices'

export const Route = createFileRoute('/')({
  loader: async ({ context: { db }, parentMatchPromise }) => {
    const since = Date.parse(`${lastMonths()[0]?.key}-01`)
    const [{ loaderData }, past, routed] = await Promise.all([
      parentMatchPromise,
      history(db),
      savedRoutes(db),
    ])
    if (!loaderData) throw notFound()
    const { rows } = loaderData
    const saved = new Set(routed.map(({ fromId, toId }) => `${fromId} ${toId}`))
    return {
      past,
      proposals: proposals(rows),
      routes: routes(flows(rows).filter(({ time }) => time >= since)).map((route) => ({
        ...route,
        saved: saved.has(`${route.from} ${route.to}`),
      })),
    }
  },
  component: Home,
})

const charts = [
  { value: 'total', label: 'Total' },
  { value: 'flow', label: 'Money flow' },
] as const

function Home() {
  const { total, institutions, rows, context } = root.useLoaderData()
  const { past, proposals: pending, routes } = Route.useLoaderData()
  const [chart, show] = useState<(typeof charts)[number]['value']>('total')
  const notices = useNotices()
  return (
    <Page
      title="Home"
      notices={notices}
      empty={!institutions.length && 'Nothing tracked yet. Add an institution to start.'}
    >
      <History
        label="Net worth"
        value={total}
        history={past}
        action={<Segmented label="Chart" value={chart} options={charts} onChange={show} />}
      >
        {chart === 'flow' ? (
          <Cashflow
            rows={rows}
            context={context}
            scope={{ kind: 'all' }}
            initial={trailing(3, monthAt(Date.now()))}
          />
        ) : undefined}
      </History>
      <Section title="Institutions">
        <Institutions institutions={institutions} />
      </Section>
      {pending.length > 0 && (
        <Section id="confirm" title="Transfers to confirm">
          <Proposals proposals={pending} />
        </Section>
      )}
      <Section
        title="Transfers"
        empty={!routes.length && 'No transfers between your accounts in the last 12 months.'}
      >
        <Transfers routes={routes} />
      </Section>
    </Page>
  )
}

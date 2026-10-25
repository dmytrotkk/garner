import { createFileRoute, notFound } from '@tanstack/react-router'
import { parse, reading } from '../data/query'
import { months } from '../data/spending'
import { Button } from '../ui/button'
import { Page, Section } from '../ui/page'
import { refine } from './-layer'
import { Movements, Summary } from './-movements'
import { matching, today } from './-search'

export const Route = createFileRoute('/movements')({
  validateSearch: ({ q }: Record<string, unknown>) => ({
    q: typeof q === 'string' || typeof q === 'number' ? String(q) : '',
  }),
  loaderDeps: ({ search: { q } }) => ({ q }),
  loader: async ({ context: { db }, deps: { q }, parentMatchPromise }) => {
    const { loaderData } = await parentMatchPromise
    if (!loaderData) throw notFound()
    const query = parse(q, today())
    const found = matching(loaderData, query)
    return { title: reading(query), found, ...(await months(db, found.rows)) }
  },
  component: Results,
})

function Results() {
  const { title, found, currency, totals } = Route.useLoaderData()
  const { q } = Route.useSearch()
  return (
    <Page
      title={title}
      action={
        <Button variant="secondary" size="sm" onClick={() => refine(q)}>
          Edit search
        </Button>
      }
    >
      <Summary
        label={found.total.label}
        total={found.total.amount}
        rows={found.rows}
        currency={currency}
      />
      <Section title="Movements" empty={!found.rows.length && 'Nothing found.'}>
        <Movements rows={found.rows} currency={currency} totals={totals} accounts open />
      </Section>
    </Page>
  )
}

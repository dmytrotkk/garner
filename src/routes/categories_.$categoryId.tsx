import { createFileRoute, notFound } from '@tanstack/react-router'
import { overview } from '../data/categories'
import { Actions } from '../ui/actions'
import { Card } from '../ui/card'
import { BlendChart } from '../ui/charts/blend'
import { Page, Section } from '../ui/page'
import { Tile } from '../ui/tile'
import { hues, icons } from './-categories'
import { categoryCommands } from './-commands'
import { Money } from './-money'
import { lastMonths, listed, Movements, Summary } from './-movements'

export const Route = createFileRoute('/categories_/$categoryId')({
  loader: async ({ context: { db }, params }) => {
    const category = (await overview(db)).categories.find(({ id }) => id === params.categoryId)
    if (!category) throw notFound()
    return { category, ...(await listed(db, { categoryId: category.id })) }
  },
  component: Category,
})

function Category() {
  const listing = Route.useLoaderData()
  const { category, rows, currency, totals } = listing
  const counted = category.type !== 'transfer'
  const flow = category.type === 'income' ? 'in' : 'spent'
  const total = Object.values(totals).reduce((sum, month) => sum + month[flow], 0)
  const hue = hues[category.icon]
  const money = (amount: number) => <Money value={{ amount, currency }} />
  const columns = lastMonths().map(({ key, label }) => {
    const value = totals[key]?.[flow] ?? 0
    return {
      label,
      slices: value > 0 ? [{ key: category.id, label: category.name, hue, value }] : [],
    }
  })
  return (
    <Page
      title={category.name}
      lead={<Tile hue={hue} icon={icons[category.icon]} size="md" />}
      action={<Actions label="Category actions" items={categoryCommands(category)} />}
    >
      <Summary
        label={category.type === 'income' ? 'Received' : 'Spent'}
        total={counted ? total : undefined}
        rows={rows}
        currency={currency}
      />
      {total > 0 && (
        <Card
          title="By month"
          description={
            category.type === 'income'
              ? 'Received in the last 12 months'
              : 'Spent in the last 12 months'
          }
        >
          <BlendChart columns={columns} format={money} />
        </Card>
      )}
      <Section
        title="Movements"
        empty={!rows.length && 'No movements yet. Categorize one to see it here.'}
      >
        <Movements {...listing} accounts open={!counted} />
      </Section>
    </Page>
  )
}

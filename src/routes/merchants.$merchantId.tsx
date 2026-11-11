import { createFileRoute, notFound } from '@tanstack/react-router'
import { overview } from '../data/categories.ts'
import { Actions } from '../ui/actions.tsx'
import { Page, Section } from '../ui/page.tsx'
import { Tile } from '../ui/tile.tsx'
import { hues, kindIcons } from './-categories.tsx'
import { merchantCommands } from './-commands.tsx'
import { root } from './-data.ts'
import { listed, Movements, Spending, Summary } from './-movements.tsx'

export const Route = createFileRoute('/merchants/$merchantId')({
  loader: async ({ context: { db }, params }) => {
    const merchant = (await overview(db)).merchants.find(({ id }) => id === params.merchantId)
    if (!merchant) throw notFound()
    return { merchant, ...(await listed(db, { merchantId: merchant.id })) }
  },
  component: Merchant,
})

function Merchant() {
  const listing = Route.useLoaderData()
  const { merchant, rows, currency, totals } = listing
  const { byCategory } = root.useLoaderData()
  const main = byCategory.get(merchant.categoryId ?? '')
  const spent = Object.values(totals).reduce((sum, { spent }) => sum + spent, 0)
  return (
    <Page
      title={merchant.name}
      lead={
        <Tile hue={main ? hues[main.icon] : 'gray'} icon={kindIcons[merchant.kind]} size="md" />
      }
      action={<Actions label="Merchant actions" items={merchantCommands(merchant)} />}
    >
      <Summary label="Spent" total={spent} rows={rows} currency={currency} />
      {spent > 0 && <Spending totals={totals} currency={currency} />}
      <Section
        title="Movements"
        empty={!rows.length && 'No movements yet. Set this merchant on a movement.'}
      >
        <Movements {...listing} accounts />
      </Section>
    </Page>
  )
}

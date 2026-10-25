import { createFileRoute, notFound } from '@tanstack/react-router'
import type { Position } from '../data/portfolio'
import { Page, Section, Stat } from '../ui/page'
import { type Column, Label, Table } from '../ui/table'
import { TokenIcon } from '../ui/token'
import { holdingCommands } from './-commands'
import { root } from './-data'
import { chain, placed } from './-holdings'
import { Amount, Money } from './-money'

export const Route = createFileRoute('/assets/$assetId')({
  loader: async ({ params, parentMatchPromise }) => {
    const { loaderData } = await parentMatchPromise
    const holding = loaderData?.holdings.find(({ id }) => id === params.assetId)
    if (!holding) throw notFound()
    return holding
  },
  component: AssetPage,
})

const columns: readonly Column<Position>[] = [
  {
    header: 'Account',
    cell: ({ account, institution }) => <Label text={account} note={institution} />,
  },
  chain,
  ...placed,
]

function AssetPage() {
  const { id, name, symbol, amount, price, value, positions } = Route.useLoaderData()
  const { institutions } = root.useLoaderData()
  const accounts = new Map(
    institutions
      .flatMap((institution) => institution.accounts)
      .map((account) => [account.id, account]),
  )
  return (
    <Page title={name} lead={<TokenIcon key={id} id={id} symbol={symbol} size="lg" />}>
      <div className="flex flex-wrap gap-x-12 gap-y-4">
        <Stat label="Value" value={<Money value={value} />} />
        <Stat label="Amount" value={<Amount value={amount} id={id} symbol={symbol} />} />
        <Stat label="Price" value={<Money value={price} format="price" />} />
      </div>
      <Section title="Held in">
        <Table
          columns={columns}
          rows={positions}
          rowKey={({ accountId, assetId }) => `${accountId} ${assetId}`}
          link={({ accountId }) => ({ to: '/accounts/$accountId', params: { accountId } })}
          actions={{
            items: (row) => {
              const account = accounts.get(row.accountId)
              return account?.kind === 'manual' ? holdingCommands(account, row) : []
            },
          }}
        />
      </Section>
    </Page>
  )
}

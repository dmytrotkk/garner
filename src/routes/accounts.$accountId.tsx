import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { date } from '../core/format.ts'
import { latest, monthAt, period } from '../data/cashflow.ts'
import { ledger } from '../data/ledger.ts'
import type { Position } from '../data/portfolio.ts'
import { valuation } from '../data/spending.ts'
import { Actions } from '../ui/actions.tsx'
import { Card } from '../ui/card.tsx'
import { Copy } from '../ui/copy.tsx'
import type { Column } from '../ui/grid.tsx'
import { menuOn } from '../ui/menu.tsx'
import { MeshCard } from '../ui/mesh-card.tsx'
import { Page, Section, Stat } from '../ui/page.tsx'
import { Table } from '../ui/table.tsx'
import { asset } from '../ui/token.tsx'
import { Cashflow } from './-cashflow.tsx'
import { accountCommands, holdingCommands } from './-commands.tsx'
import { root } from './-data.ts'
import { chain, placed } from './-holdings.tsx'
import { glyphOf } from './-institutions.tsx'
import { code, Money, sum } from './-money.tsx'
import { listed, Movements, recent, Spending } from './-movements.tsx'
import { useNotices } from './-notices.tsx'

export const Route = createFileRoute('/accounts/$accountId')({
  loader: async ({ context: { db }, params, parentMatchPromise }) => {
    const { loaderData } = await parentMatchPromise
    const owner = loaderData?.institutions
      .flatMap((institution) => institution.accounts.map((account) => ({ institution, account })))
      .find(({ account }) => account.id === params.accountId)
    if (!owner) throw notFound()
    const [list, lines] = await Promise.all([
      listed(db, { accountId: params.accountId }),
      ledger(db, owner.institution.id),
    ])
    const covered = lines.flatMap(({ accountId, assetId, coverage }) =>
      accountId === params.accountId && coverage.state === 'ledger' ? { assetId, ...coverage } : [],
    )
    return { ...owner, ...list, covered, context: await valuation(db, list.rows) }
  },
  component: AccountPage,
})

const chained: readonly Column<Position>[] = [asset, chain, ...placed]
const manual: readonly Column<Position>[] = [asset, ...placed]
function AccountPage() {
  const { institution, account, covered, context, ...listing } = Route.useLoaderData()
  const commands = accountCommands(account)
  const primary =
    account.kind === 'evm'
      ? undefined
      : commands.find(({ id }) => id.startsWith(listing.rows.length ? 'import ' : 'add-holding '))
  const items = commands.filter((command) => command !== primary)
  const notices = useNotices()
  const { byCategory } = root.useLoaderData()
  const slices = recent(byCategory, listing.totals, listing.rows)
  const meta = (
    <div className="flex flex-wrap items-center gap-x-4 text-dim">
      {account.kind === 'evm' ? (
        <span className="flex items-center gap-1">
          {account.address}
          <Copy text={account.address} label="Copy address" />
        </span>
      ) : (
        'Manual'
      )}
      <Link
        to="/institutions/$institutionId"
        params={{ institutionId: institution.id }}
        className="transition hover:text-ink"
      >
        {institution.name}
      </Link>
    </div>
  )

  return (
    <Page
      title={account.name}
      action={<Actions label="Account actions" primary={primary} items={items} />}
      notices={listing.rows.length ? notices : undefined}
    >
      {listing.rows.length ? (
        <div className="flex gap-4">
          <div className="w-90 shrink-0" {...menuOn(commands)}>
            <MeshCard
              slices={slices.length ? slices : [{ hue: 'gray', value: 1 }]}
              name={account.name}
              face={{ glyph: glyphOf(institution), balance: <Money value={account.value} /> }}
            />
          </div>
          <div className="grid min-w-0 flex-1">
            <Spending {...listing} fit />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Stat label="Total" value={<Money value={account.value} />} />
          {meta}
        </div>
      )}
      {listing.rows.length > 0 && (
        <Card title="Money flow">
          <Cashflow
            rows={listing.rows}
            context={context}
            scope={{ kind: 'account', accountId: account.id }}
            initial={period('month', latest(listing.rows) ?? monthAt(Date.now()))}
          />
        </Card>
      )}
      <Section
        title="Holdings"
        empty={
          !account.positions.length &&
          (account.kind === 'evm'
            ? 'Nothing held here yet.'
            : 'No holdings yet. Add one to track it.')
        }
      >
        <Table
          columns={account.kind === 'evm' ? chained : manual}
          rows={account.positions}
          rowKey={({ assetId }) => assetId}
          link={({ id }) => ({ to: '/assets/$assetId', params: { assetId: id } })}
          {...(account.kind === 'manual' && {
            actions: {
              items: (row: Position) => holdingCommands(account, row),
              button: 'Holding actions',
            },
          })}
        />
      </Section>
      {listing.rows.length > 0 && (
        <Section title="Movements">
          <Movements {...listing} />
          <ul className="flex flex-col gap-1 text-dim">
            {covered.map(({ assetId, from, to, opening }) => (
              <li key={assetId}>
                {code(assetId)} covered from {date(from)} to {date(to)}
                {opening !== 0n && <>, with {sum(assetId, opening)} at the start</>}.
              </li>
            ))}
            {covered.flatMap(({ assetId, holes }) =>
              holes.map(({ from, to, quantity }) => (
                <li key={`${assetId} ${to}`} className="text-negative">
                  {date(from)} to {date(to)}: {sum(assetId, quantity)} is not explained by the{' '}
                  {code(assetId)} rows.
                </li>
              )),
            )}
          </ul>
        </Section>
      )}
    </Page>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { history } from '../data/history'
import type { AccountView } from '../data/portfolio'
import { Button } from '../ui/button'
import { Page, Section } from '../ui/page'
import { type Column, Label, Table } from '../ui/table'
import { accountCommands, importInto } from './-commands'
import { root } from './-data'
import { History } from './-history'
import { Money } from './-money'
import { listed, Movements } from './-movements'
import { useNotices } from './-notices'

export const Route = createFileRoute('/fiat')({
  loader: async ({ context: { db } }) => {
    const [past, list] = await Promise.all([
      history(db, { cash: true }),
      listed(db, { cash: true }),
    ])
    return { past, ...list }
  },
  component: Fiat,
})

const columns: readonly Column<AccountView & { institution: string }>[] = [
  { header: 'Account', cell: ({ name, institution }) => <Label text={name} note={institution} /> },
  { header: 'Value', cell: ({ fiat }) => <Money value={fiat} /> },
]

function Fiat() {
  const { fiat, institutions } = root.useLoaderData()
  const accounts = institutions.flatMap(({ name, accounts }) =>
    accounts.filter(({ cash }) => cash).map((account) => ({ ...account, institution: name })),
  )
  const { past, ...listing } = Route.useLoaderData()
  const notices = useNotices()

  return (
    <Page
      title="Fiat"
      notices={notices}
      empty={!accounts.length && 'No bank accounts yet. Import a statement to start.'}
      action={
        <Button size="sm" onClick={() => importInto()}>
          Import file…
        </Button>
      }
    >
      <History label="Total" value={fiat} history={past} />
      <Section title="Accounts">
        <Table
          columns={columns}
          rows={accounts}
          rowKey={({ id }) => id}
          link={({ id }) => ({ to: '/accounts/$accountId', params: { accountId: id } })}
          actions={{ items: accountCommands }}
        />
      </Section>
      {listing.rows.length > 0 && (
        <Section title="Movements">
          <Movements {...listing} accounts />
        </Section>
      )}
    </Page>
  )
}

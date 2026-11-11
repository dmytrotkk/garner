import { Wallet01Icon } from '@hugeicons/core-free-icons'
import type { AccountView, InstitutionView } from '../data/portfolio.ts'
import { Glyph } from '../ui/glyph.tsx'
import { type Column, Label } from '../ui/grid.tsx'
import { markOf } from '../ui/marks.ts'
import { Table } from '../ui/table.tsx'
import { institutionCommands } from './-commands.tsx'
import { Money } from './-money.tsx'

type Named = { name: string; accounts: readonly Pick<AccountView, 'kind'>[] }

export function glyphOf({ name, accounts }: Named): Glyph {
  const mark = markOf(name)
  if (mark) return { mark }
  if (accounts.length && accounts.every(({ kind }) => kind === 'evm')) return Wallet01Icon
  return { letter: ([...name.trim()][0] ?? '').toUpperCase() }
}

const columns: readonly Column<InstitutionView>[] = [
  {
    header: 'Institution',
    cell: (institution) => (
      <span className="flex items-center gap-2.5">
        <Glyph glyph={glyphOf(institution)} />
        <Label text={institution.name} />
      </span>
    ),
  },
  { header: 'Accounts', cell: ({ accounts }) => accounts.length },
  { header: 'Value', cell: ({ value }) => <Money value={value} /> },
]

export function Institutions({ institutions }: { institutions: readonly InstitutionView[] }) {
  return (
    <Table
      columns={columns}
      rows={institutions}
      rowKey={({ id }) => id}
      link={({ id }) => ({ to: '/institutions/$institutionId', params: { institutionId: id } })}
      actions={{ items: institutionCommands }}
    />
  )
}

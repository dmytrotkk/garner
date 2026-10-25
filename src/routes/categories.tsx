import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { quantity } from '../core/format'
import { type CategoryRow, type MerchantRow, overview, type RuleRow } from '../data/categories'
import { ruled } from '../data/ledger'
import { Button } from '../ui/button'
import { type Column, DataTable } from '../ui/data-table'
import { Page, Section } from '../ui/page'
import { Label } from '../ui/table'
import { Tile } from '../ui/tile'
import { Assigned, hues, icons, kindIcons, kindLabel, typeLabels } from './-categories'
import { categoryCommands, merchantCommands, ruleCommands } from './-commands'
import { ask } from './-layer'

export const Route = createFileRoute('/categories')({
  loader: ({ context: { db } }) => overview(db),
  component: Categories,
})

const used = { id: 'movements', desc: true }

const kinds: readonly Column<CategoryRow>[] = [
  {
    id: 'category',
    header: 'Category',
    cell: ({ name, icon }) => (
      <span className="flex min-w-0 items-center gap-3">
        <Tile hue={hues[icon]} icon={icons[icon]} size="sm" />
        <span className="truncate font-medium">{name}</span>
      </span>
    ),
    sort: ({ name }) => name.toLowerCase(),
    width: 'fill',
  },
  { id: 'type', header: 'Type', cell: ({ type }) => typeLabels[type], sort: ({ type }) => type },
  {
    id: 'movements',
    header: 'Movements',
    cell: ({ movements }) => quantity(movements),
    sort: ({ movements }) => movements,
    end: true,
  },
]

const ruleColumns: readonly Column<RuleRow>[] = [
  {
    id: 'party',
    header: 'Rows like',
    cell: ({ party }) => <span className="truncate font-medium">{party}</span>,
    sort: ({ party }) => party,
    width: 'fill',
  },
  {
    id: 'category',
    header: 'Category',
    cell: (row) => <Assigned assignment={ruled(row.party, row)} />,
    width: 'lg',
  },
  {
    id: 'movements',
    header: 'Movements',
    cell: ({ movements }) => quantity(movements),
    sort: ({ movements }) => movements,
    end: true,
  },
  {
    id: 'by',
    header: 'By',
    cell: ({ source }) => (source === 'user' ? 'You' : 'AI'),
    sort: ({ source }) => source,
    width: 'sm',
  },
]

const merchantColumns = (categories: readonly CategoryRow[]): readonly Column<MerchantRow>[] => [
  {
    id: 'merchant',
    header: 'Merchant',
    cell: ({ name, kind, categoryId }) => {
      const main = categories.find(({ id }) => id === categoryId)
      return (
        <span className="flex min-w-0 items-center gap-3">
          <Tile hue={main ? hues[main.icon] : 'gray'} icon={kindIcons[kind]} size="sm" />
          <Label text={name} note={kindLabel(kind)} />
        </span>
      )
    },
    sort: ({ name }) => name.toLowerCase(),
    width: 'fill',
  },
  {
    id: 'parties',
    header: 'Parties',
    cell: ({ parties }) => quantity(parties),
    sort: ({ parties }) => parties,
    end: true,
  },
  {
    id: 'movements',
    header: 'Movements',
    cell: ({ movements }) => quantity(movements),
    sort: ({ movements }) => movements,
    end: true,
  },
  {
    id: 'by',
    header: 'By',
    cell: ({ by }) => (by === 'user' ? 'You' : 'AI'),
    sort: ({ by }) => by,
    width: 'sm',
  },
]

function Categories() {
  const { categories, rules, merchants } = Route.useLoaderData()
  const ai = rules.filter(({ source }) => source === 'ai').length
  const aiMerchants = merchants.filter(({ by }) => by === 'ai').length
  const merchantTable = useMemo(() => merchantColumns(categories), [categories])
  return (
    <Page
      title="Categories"
      action={
        <Button size="sm" onClick={() => ask({ kind: 'add-category' })}>
          Add category…
        </Button>
      }
    >
      <DataTable
        columns={kinds}
        rows={categories}
        rowKey={({ id }) => id}
        link={({ id }) => ({ to: '/categories/$categoryId', params: { categoryId: id } })}
        initial={used}
        batch={10}
        actions={{ items: categoryCommands, button: 'Category actions' }}
      />
      <Section
        title="Merchants"
        empty={
          !merchants.length && 'No merchants yet. Set one on a movement, or let the AI name them.'
        }
        action={
          <Button variant="ghost" size="sm" onClick={() => ask({ kind: 'add-merchant' })}>
            Add merchant…
          </Button>
        }
      >
        <DataTable
          columns={merchantTable}
          link={({ id }) => ({ to: '/merchants/$merchantId', params: { merchantId: id } })}
          rows={merchants}
          rowKey={({ id }) => id}
          initial={used}
          batch={10}
          actions={{ items: merchantCommands, button: 'Merchant actions' }}
        />
      </Section>
      <Section
        title="Rules"
        empty={
          !rules.length && 'No rules yet. Categorize a movement with All like this to make one.'
        }
        action={
          (ai > 0 || aiMerchants > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => ask({ kind: 'clear-ai', rules: ai, merchants: aiMerchants })}
            >
              Remove AI answers…
            </Button>
          )
        }
      >
        <DataTable
          columns={ruleColumns}
          rows={rules}
          rowKey={({ party }) => party}
          initial={used}
          batch={10}
          actions={{ items: ruleCommands, button: 'Rule actions' }}
        />
      </Section>
    </Page>
  )
}

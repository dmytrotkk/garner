import { Search01Icon } from '@hugeicons/core-free-icons'
import { useNavigate } from '@tanstack/react-router'
import { day, local, plural } from '../core/format.ts'
import {
  hit,
  hits,
  type Index,
  index,
  type Ranked,
  search,
  searchable,
  starts,
  tokens,
} from '../core/search.ts'
import type { Movement } from '../data/ledger.ts'
import { type Flag, holds, literal, parse, type Query, reading } from '../data/query.ts'
import type { Day } from '../data/schema.ts'
import { internal, valuer } from '../data/spending.ts'
import { peer } from '../data/transfers.ts'
import type { Command } from '../ui/command.ts'
import type { Route } from './__root.tsx'
import { hues, icons, kindIcons, kindLabel, typeGroups } from './-categories.tsx'
import { root } from './-data.ts'
import { code, Money, sum } from './-money.tsx'
import { kinds, tileOf } from './-movements.tsx'

type Data = Pick<
  (typeof Route)['types']['loaderData'],
  'rows' | 'context' | 'institutions' | 'holdings' | 'merchants' | 'byCategory'
>
type Built = { index: Index; worth: Float64Array }
export type Total = { label: 'Spent' | 'Received' | 'Net'; amount: number }
export type Found = { rows: Movement[]; typo: boolean; total: Total }

type Merchants = ReadonlyMap<string, Data['merchants'][number]>

const merchantOf = (merchants: Merchants, row: Movement) =>
  row.kind !== 'trade' && row.identity.state === 'linked'
    ? merchants.get(row.identity.merchantId)
    : undefined

const categoryOf = (data: Data, row: Movement) =>
  row.kind !== 'trade' && 'categoryId' in row.assignment
    ? data.byCategory.get(row.assignment.categoryId)
    : undefined

export const today = () => local(Date.now()) as Day

const cache = new WeakMap<readonly Movement[], Built>()

function built(data: Data) {
  const known = cache.get(data.rows)
  if (known) return known
  const places = new Map(
    data.institutions.flatMap((institution) =>
      institution.accounts.map(({ id, name }) => [id, [name, institution.name]] as const),
    ),
  )
  const symbols = new Map<string, string>(data.holdings.map(({ id, symbol }) => [id, symbol]))
  const merchants = new Map(data.merchants.map((merchant) => [merchant.id, merchant]))
  const textOf = (row: Movement) => {
    const category = categoryOf(data, row)
    const type = internal(row, category?.type) ? 'transfer' : category?.type
    const other = row.kind === 'transfer' ? peer(row.transfer) : undefined
    return [
      row.memo,
      row.note,
      merchantOf(merchants, row)?.name,
      category?.name,
      type && typeGroups[type],
      ...(places.get(row.accountId) ?? []),
      other && places.get(other.accountId)?.[0],
      row.kind !== 'transfer' && kinds[row.kind],
      row.assetId.startsWith('fiat:') ? code(row.assetId) : symbols.get(row.assetId),
    ]
      .filter(Boolean)
      .join(' ')
  }
  const value = valuer(data.context)
  const made = {
    index: index(data.rows.map((row) => [textOf(row)])),
    worth: Float64Array.from(
      data.rows,
      ({ assetId, time, quantity }) => value(assetId, time)(quantity) ?? 0,
    ),
  }
  cache.set(data.rows, made)
  return made
}

const paired = (row: Movement) => row.kind === 'transfer' && row.transfer.state === 'paired'

export function matching(
  data: Data,
  query: Query,
  known: (term: string) => boolean = () => false,
): Found {
  const { index: words, worth } = built(data)
  const found = [...new Set(query.words.flatMap(tokens))].map((term) =>
    hits(words, term, !known(term)),
  )
  const test = holds(query.facets, (row) => categoryOf(data, row)?.type)
  const flagged = (flag: Flag) =>
    query.facets.some((facet) => facet.kind === 'flag' && facet.flag === flag)
  const label = flagged('spent') ? 'Spent' : flagged('received') ? 'Received' : 'Net'
  const rows: Movement[] = []
  let amount = 0
  data.rows.forEach((row, at) => {
    const field = words.docs[at]?.[0]
    if (!field || !test(row) || !found.every((each) => hit(field, each) >= 0)) return
    rows.push(row)
    const value = worth[at] ?? 0
    amount += label === 'Spent' ? -value : label === 'Net' && paired(row) ? 0 : value
  })
  return { rows, typo: found.some(({ typo }) => typo), total: { label, amount } }
}

export function useFind(commands: readonly Command[]) {
  const data = root.useLoaderData()
  const navigate = useNavigate()
  const merchants = new Map(data.merchants.map((merchant) => [merchant.id, merchant]))
  const typed: Command[] = [
    ...data.merchants.map(({ id, name, kind }) => ({
      id,
      group: 'Merchants',
      label: name,
      note: kindLabel(kind),
      icon: kindIcons[kind],
      run: () => navigate({ to: '/merchants/$merchantId', params: { merchantId: id } }),
    })),
    ...data.categories.map(({ id, name, hint, icon }) => ({
      id,
      group: 'Categories',
      label: name,
      note: hint,
      icon: { tile: { hue: hues[icon], icon: icons[icon] } },
      run: () => navigate({ to: '/categories/$categoryId', params: { categoryId: id } }),
    })),
  ]
  const open = (q: string) => () => navigate({ to: '/movements', search: { q } })
  const summary = (id: string, q: string, query: Query, found: Found): Command => ({
    id,
    group: 'Movements',
    label: reading(query),
    icon: Search01Icon,
    aside: (
      <span className="flex gap-2.5">
        {plural(found.rows.length, 'movement')}
        <span className="flex gap-1.5">
          <span>{found.total.label}</span>
          <Money value={{ amount: found.total.amount, currency: data.context.currency }} />
        </span>
      </span>
    ),
    run: open(q),
  })
  return (input: string): Ranked<Command>[] => {
    const { index: words } = built(data)
    if (!input.trim()) return search(commands, input, 5)
    const items = [...commands, ...typed]
    const named = searchable(items)
    const known = (term: string) => starts(named, term) || starts(words, term)
    const now = today()
    const query = parse(input, now)
    const groups = search(items, query.words.length ? query.words.join(' ') : input, 5, known)
    if (!query.words.length && !query.facets.length) return groups
    const found = matching(data, query, known)
    if (!found.rows.length && !query.facets.length && groups.length) return groups
    const other = literal(input, now)
    const quoted = other === undefined ? undefined : parse(other, now)
    const also = other && quoted ? matching(data, quoted, known) : undefined
    const movements: Ranked<Command> = {
      label: 'Movements',
      tier: query.facets.length ? -1 : found.typo ? 5 : 2,
      items: [
        summary('movements', input, query, found),
        ...(other && quoted && also?.rows.length ? [summary('words', other, quoted, also)] : []),
        ...found.rows.slice(0, 3).map((row) => {
          const merchant = merchantOf(merchants, row)
          return {
            id: `${row.accountId} ${row.ref} ${row.assetId}`,
            group: 'Movements',
            label: merchant?.name ?? row.memo ?? kinds[row.kind],
            note: `${day(row.time)} · ${data.accounts.get(row.accountId)?.name ?? ''}`,
            icon: { tile: tileOf(merchant, categoryOf(data, row)) },
            aside: sum(row.assetId, row.quantity),
            run: open(input),
          }
        }),
      ],
    }
    const at = groups.findIndex(({ tier }) => tier >= movements.tier)
    return at < 0 ? [...groups, movements] : groups.toSpliced(at, 0, movements)
  }
}

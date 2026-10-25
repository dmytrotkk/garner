import { units } from '../core/format'
import type { Db } from './db'
import { chainName } from './evm'
import { ledger } from './ledger'
import {
  type Account,
  type AssetId,
  accountOf,
  type CanonicalId,
  type Institution,
  q,
} from './schema'

export type Position = {
  accountId: string
  account: string
  kind: Account['kind']
  institutionId: string
  institution: string
  assetId: AssetId
  chain: string | null
  id: CanonicalId
  symbol: string
  name: string
  quantity: bigint
  decimals: number
  amount: number
  price: number | null
  value: number | null
}

type Priced =
  | { price: number; value: number; share: number | null }
  | { price: null; value: null; share: null }

export type Holding = Priced & {
  id: CanonicalId
  symbol: string
  name: string
  amount: number
  positions: Position[]
}

type Worth = { value: number; crypto: number; fiat: number }

export type AccountView = Account & Worth & { cash: boolean; coins: boolean; positions: Position[] }

export type InstitutionView = Institution & Worth & { accounts: AccountView[] }

const lines = q
  .selectFrom('balance')
  .select(['accountId', 'assetId'])
  .union(q.selectFrom('entry').select(['accountId', 'assetId']))

const positions = q
  .selectFrom(lines.as('line'))
  .innerJoin('account', 'account.id', 'line.accountId')
  .innerJoin('institution', 'institution.id', 'account.institutionId')
  .innerJoin('asset', 'asset.id', 'line.assetId')
  .innerJoin('asset as canonical', 'canonical.id', 'asset.canonical')
  .leftJoin('price', (join) =>
    join.onRef('price.assetId', '=', 'asset.canonical').on('price.day', '=', (eb) =>
      eb
        .selectFrom('price as latest')
        .select((latest) => latest.fn.max('latest.day').as('day'))
        .whereRef('latest.assetId', '=', 'asset.canonical'),
    ),
  )
  .select([
    'line.accountId',
    'line.assetId',
    'account.name as account',
    'account.kind',
    'account.institutionId',
    'institution.name as institution',
    'asset.canonical as id',
    'canonical.symbol',
    'canonical.name',
    'asset.decimals',
    'price.usd as price',
  ])
  .orderBy('line.accountId')
  .orderBy('line.assetId')

type Valued = { value: number | null; symbol: string }

const shown = ({ kind, value }: Pick<Position, 'kind' | 'value'>) =>
  kind === 'manual' || value === null || value >= 0.01
const order = (a: Valued, b: Valued) =>
  (b.value ?? Number.NEGATIVE_INFINITY) - (a.value ?? Number.NEGATIVE_INFINITY) ||
  a.symbol.localeCompare(b.symbol)

const sum = (values: readonly (number | null)[]) =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0)

const currency = ({ id }: Pick<Position, 'id'>) => id.startsWith('fiat:')

const worth = (held: readonly Pick<Position, 'id' | 'value'>[]): Worth => {
  const of = (cash: boolean) =>
    sum(held.map((position) => (currency(position) === cash ? position.value : 0)))
  return { value: sum(held.map(({ value }) => value)), crypto: of(false), fiat: of(true) }
}

function rollup(held: readonly Position[]): Holding[] {
  const assets = [...Map.groupBy(held, ({ id }) => id)]
  const gross = sum(assets.map(([, group]) => Math.max(0, sum(group.map(({ value }) => value)))))
  return assets
    .flatMap(([id, group]): Holding[] => {
      const [first] = group
      if (!first) return []
      const { symbol, name, price } = first
      const base = {
        id,
        symbol,
        name,
        amount: sum(group.map(({ amount }) => amount)),
        positions: group.filter(shown).sort(order),
      }
      if (price === null) return [{ ...base, price, value: null, share: null }]
      const value = sum(group.map((position) => position.value))
      return [{ ...base, price, value, share: value < 0 ? null : gross ? value / gross : 0 }]
    })
    .filter(({ positions }) => positions.length > 0)
    .sort(order)
}

export async function portfolio(db: Db, institutionId?: string) {
  const [groups, rows, latest, folded] = await Promise.all([
    db.read(q.selectFrom('institution').selectAll().orderBy('id')),
    db.read(q.selectFrom('account').selectAll().orderBy('id')),
    db.read(positions),
    ledger(db, institutionId),
  ])
  const closing = new Map(
    folded.map(({ accountId, assetId, closings }) => [
      `${accountId} ${assetId}`,
      closings.at(-1)?.quantity,
    ]),
  )
  const held = latest.flatMap((row) => {
    const quantity = closing.get(`${row.accountId} ${row.assetId}`)
    if (!quantity) return []
    const amount = units(quantity, row.decimals)
    const value = row.price === null ? null : amount * row.price
    return {
      ...row,
      chain: chainName(row.assetId) ?? null,
      quantity,
      amount,
      value,
    }
  })
  const byAccount = Map.groupBy(held, ({ accountId }) => accountId)
  const lined = Map.groupBy(latest, ({ accountId }) => accountId)

  const valued: AccountView[] = rows.map((row) => {
    const owned = byAccount.get(row.id) ?? []
    const kept = lined.get(row.id) ?? []
    return {
      ...accountOf(row),
      ...worth(owned),
      cash: kept.some(currency),
      coins: !kept.every(currency),
      positions: owned.filter(shown).sort(order),
    }
  })
  const byInstitution = Map.groupBy(valued, ({ institutionId }) => institutionId)
  const views: InstitutionView[] = groups
    .filter(({ id }) => !institutionId || id === institutionId)
    .map((institution) => ({
      ...institution,
      ...worth(held.filter((position) => position.institutionId === institution.id)),
      accounts: byInstitution.get(institution.id) ?? [],
    }))

  const { value: total, crypto, fiat } = worth(held)
  return { total, crypto, fiat, institutions: views, holdings: rollup(held) }
}

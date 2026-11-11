import { units } from '../core/format.ts'
import { categories } from './categories.ts'
import type { Db } from './db.ts'
import { carry, prices } from './history.ts'
import type { Movement } from './ledger.ts'
import {
  type AssetId,
  type CanonicalId,
  type CategoryType,
  dayOf,
  isCanonical,
  monthOf,
  type Price,
  scale,
} from './schema.ts'
import { type Currency, settings } from './settings.ts'

export type Valuation = {
  currency: Currency
  types: ReadonlyMap<string, CategoryType>
  prices: readonly Price[]
}

export async function valuation(db: Db, movements: readonly Movement[]): Promise<Valuation> {
  const [list, { currency }] = await Promise.all([categories(db), settings(db)])
  const fiat: CanonicalId = `fiat:${currency}`
  const rows = await db.read(
    prices([fiat, ...movements.map(({ assetId }) => assetId).filter(isCanonical)]),
  )
  return { currency, types: new Map(list.map(({ id, type }) => [id, type])), prices: rows }
}

export const valuer = ({ currency, prices: rows }: Valuation) => {
  const at = carry(rows)
  const fiat: CanonicalId = `fiat:${currency}`
  return (assetId: AssetId, time: number) => {
    const usd = at(dayOf(time))
    const rate = currency === 'USD' ? 1 : usd.get(fiat)
    const price = isCanonical(assetId) ? usd.get(assetId) : undefined
    return (amount: bigint): number | undefined =>
      assetId === fiat
        ? units(amount, scale)
        : rate && price
          ? (units(amount, scale) * price) / rate
          : undefined
  }
}

export const internal = (row: Movement, type: CategoryType | undefined) =>
  (row.kind === 'transfer' && row.transfer.state === 'paired') || type === 'transfer'

export const spends = (row: Movement, type: CategoryType | undefined) =>
  row.kind !== 'trade' &&
  !internal(row, type) &&
  (type === 'expense' || (type === undefined && row.quantity < 0n))

type Month = { spent: number; in: number; out: number; categories: Record<string, number> }

export async function months(db: Db, movements: readonly Movement[]) {
  const context = await valuation(db, movements)
  const worth = valuer(context)
  const totals: Record<string, Month> = {}
  for (const moved of movements.toSorted((a, b) => a.time - b.time)) {
    if (moved.kind === 'trade') continue
    const { assignment, assetId, quantity, time } = moved
    const type = 'categoryId' in assignment ? context.types.get(assignment.categoryId) : undefined
    const priced = worth(assetId, time)
    const value = (amount: bigint) => priced(amount) ?? 0
    const month = totals[monthOf(time)] ?? { spent: 0, in: 0, out: 0, categories: {} }
    totals[monthOf(time)] = month
    const spend = (amount: number, key: string) => {
      month.spent += amount
      month.categories[key] = (month.categories[key] ?? 0) + amount
    }
    if (internal(moved, type)) {
      if (moved.kind !== 'transfer') continue
      const { transfer } = moved
      const hidden =
        transfer.state === 'paired' && quantity < 0n ? transfer.sent - transfer.received : 0n
      if (hidden - moved.fee > 0n) spend(value(hidden - moved.fee), '')
      continue
    }
    const amount = value(quantity)
    if (amount > 0) month.in += amount
    else month.out -= amount
    if (spends(moved, type)) spend(-amount, 'categoryId' in assignment ? assignment.categoryId : '')
  }
  return { currency: context.currency, totals }
}

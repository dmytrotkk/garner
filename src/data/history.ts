import { units } from '../core/format'
import type { Db } from './db'
import { ledger } from './ledger'
import { type AssetId, type CanonicalId, type Day, dayOf, type Price, q } from './schema'
import { display, settings } from './settings'

type Held = { canonical: CanonicalId; units: number }

type Row = Held & { accountId: string; assetId: AssetId; day: Day }

export async function closings(db: Db, institutionId?: string): Promise<Row[]> {
  const [lines, assets] = await Promise.all([
    ledger(db, institutionId),
    db.read(q.selectFrom('asset').select(['id', 'canonical', 'decimals'])),
  ])
  const coins = new Map(assets.map(({ id, ...coin }) => [id, coin]))
  return lines
    .flatMap(({ accountId, assetId, closings }) => {
      const coin = coins.get(assetId)
      if (!coin) return []
      return closings.map(({ day, quantity }) => ({
        accountId,
        assetId,
        day,
        canonical: coin.canonical,
        units: units(quantity, coin.decimals),
      }))
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}

export const prices = (ids: Iterable<CanonicalId>) =>
  q
    .selectFrom('price')
    .select(['assetId', 'day', 'usd'])
    .where('assetId', 'in', [...new Set(ids)])
    .orderBy('day')

export function* walk(rows: readonly Row[], to: Day): Generator<[Day, Held[]]> {
  const first = rows[0]
  if (!first) return
  const byDay = Map.groupBy(rows, ({ day }) => day)
  const open = new Map<string, Held>()
  for (let time = Date.parse(first.day); time <= Date.parse(to); time += 86_400_000) {
    const day = dayOf(time)
    for (const { accountId, assetId, canonical, units } of byDay.get(day) ?? [])
      open.set(`${accountId} ${assetId}`, { canonical, units })
    yield [day, [...open.values()]]
  }
}

export function carry(rows: readonly Price[]) {
  const usd = new Map<CanonicalId, number>()
  let next = 0
  return (day: Day) => {
    for (let row = rows[next]; row && row.day <= day; row = rows[++next])
      usd.set(row.assetId, row.usd)
    return usd
  }
}

type Scope = { institutionId?: string | undefined; cash?: boolean }

export async function history(db: Db, { institutionId, cash }: Scope = {}, now = Date.now()) {
  const [all, { currency }] = await Promise.all([
    closings(db, institutionId),
    settings(db).then((stored) => display(db, stored.currency)),
  ])
  const rows = cash ? all.filter(({ canonical }) => canonical.startsWith('fiat:')) : all
  const fiat: CanonicalId = `fiat:${currency}`
  const at = carry(await db.read(prices([fiat, ...rows.map(({ canonical }) => canonical)])))
  const points = walk(rows, dayOf(now))
    .flatMap(([day, held]) => {
      const usd = at(day)
      const rate = currency === 'USD' ? 1 : usd.get(fiat)
      const total = held.reduce(
        (sum, { canonical, units }) => sum + units * (usd.get(canonical) ?? 0),
        0,
      )
      return rate ? [{ day, value: total / rate }] : []
    })
    .toArray()
  return { currency, points }
}

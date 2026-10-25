import { type Coin, coins } from './coingecko'
import type { Db } from './db'
import type { Fetch } from './host'
import { type AssetId, q } from './schema'
import { type Settings, setSetting, settings } from './settings'

const hour = 3_600_000
const week = 168 * hour
const chunk = 5000

export const unlisted =
  'The coin list did not load from CoinGecko, which may be unreachable or limiting requests. Try again later.'

export const due = (seenAt: number | null, failure: Settings['coinListFailure'], now: number) =>
  seenAt === null ||
  (now - seenAt > week &&
    (failure === null || now - failure.at >= Math.min(2 ** (failure.count - 1), 24) * hour))

async function store(db: Db, listed: Map<AssetId, Coin>, seenAt: number) {
  const rows = [...listed].map(([id, coin]) => ({ id, ...coin, seenAt }))
  await db.write(
    q.deleteFrom('token'),
    ...Array.from({ length: Math.ceil(rows.length / chunk) }, (_, page) =>
      q.insertInto('token').values(rows.slice(page * chunk, (page + 1) * chunk)),
    ),
    setSetting('coinListFailure', null, seenAt),
  )
}

export async function tokens(db: Db, fetch: Fetch, now: number): Promise<Map<AssetId, Coin>> {
  const [[age], { coinListFailure }] = await Promise.all([
    db.read(q.selectFrom('token').select((eb) => eb.fn.max('seenAt').as('seenAt'))),
    settings(db),
  ])
  const seenAt = age?.seenAt ?? null
  if (due(seenAt, coinListFailure, now))
    await coins(fetch).then(
      (listed) => store(db, listed, now),
      () => {
        if (seenAt === null) throw new Error(unlisted)
        return db.write(
          setSetting('coinListFailure', { count: (coinListFailure?.count ?? 0) + 1, at: now }, now),
        )
      },
    )
  const rows = await db.read(q.selectFrom('token').select(['id', 'coin', 'symbol', 'name', 'rank']))
  return new Map(rows.map(({ id, ...coin }) => [id, coin]))
}

export const listed = q
  .selectFrom('token')
  .select(['id', 'symbol', 'name'])
  .where('id', 'like', 'coingecko:%')
  .orderBy('rank')

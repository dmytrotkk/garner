import type { Db } from './db.ts'
import { usdPerDay } from './frankfurter.ts'
import { closings, prices, walk } from './history.ts'
import type { Fetch } from './host.ts'
import { chart } from './llama.ts'
import { type CanonicalId, type Day, dayOf, type Price } from './schema.ts'

const span = 500
const lanes = 5
const unfilled = new WeakMap<Db, Set<string>>()

async function series(fetch: Fetch, assetId: CanonicalId, from: Day, to: Day) {
  if (assetId.startsWith('fiat:')) {
    const rates = await usdPerDay(fetch, assetId.slice('fiat:'.length), from, to)
    return (day: Day) => rates.findLast(([published]) => published <= day)?.[1]
  }
  const quotes = new Map(await chart(fetch, assetId, from, to))
  return (day: Day) => quotes.get(day)
}

export async function backfill(
  db: Db,
  fetch: Fetch,
  rated: readonly CanonicalId[],
  now: number,
): Promise<Price[]> {
  const asked = unfilled.get(db) ?? new Set<string>()
  unfilled.set(db, asked)
  const rows = await closings(db)
  const stored = await db.read(prices([...rated, ...rows.map(({ canonical }) => canonical)]))
  const moved = Map.groupBy(rows, ({ day }) => day)
  const done = new Set([...asked, ...stored.map(({ assetId, day }) => `${assetId} ${day}`)])
  const gaps = Map.groupBy(
    walk(rows, dayOf(now - 86_400_000)).flatMap(([day, held]) =>
      [
        ...new Set([
          ...rated,
          ...held.flatMap(({ canonical, units }) => (units ? canonical : [])),
          ...(moved.get(day) ?? []).flatMap(({ canonical }) =>
            canonical.startsWith('fiat:') ? canonical : [],
          ),
        ]),
      ]
        .filter((assetId) => !done.has(`${assetId} ${day}`))
        .map((assetId) => ({ assetId, day })),
    ),
    ({ assetId, day }) => {
      const age = (now - Date.parse(day)) / 86_400_000
      return `${assetId} ${assetId.startsWith('fiat:') ? 0 : Math.floor(age / span)}`
    },
  ).values()
  const filled: Price[] = []
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (const gap of gaps) {
        const [first, last] = [gap[0], gap.at(-1)]
        if (!first || !last) return
        const at = await series(fetch, first.assetId, first.day, last.day).catch(() => undefined)
        if (!at) return
        for (const { assetId, day } of gap) {
          const usd = at(day)
          if (usd === undefined || usd < 0) asked.add(`${assetId} ${day}`)
          else filled.push({ assetId, day, usd })
        }
      }
    }),
  )
  return filled
}

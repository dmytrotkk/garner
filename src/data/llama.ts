import { z } from '../core/zod'
import type { Fetch } from './host'
import { type CanonicalId, type Day, dayOf } from './schema'

const Prices = z.object({ coins: z.record(z.string(), z.object({ price: z.number() })) })

const Chart = z.object({
  coins: z.record(
    z.string(),
    z.object({ prices: z.object({ timestamp: z.number(), price: z.number() }).array() }),
  ),
})

const size = 100

export async function prices(
  fetch: Fetch,
  assetIds: readonly CanonicalId[],
): Promise<Map<CanonicalId, number>> {
  const served = assetIds.filter((id) => id.startsWith('coingecko:'))
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(served.length / size) }, async (_, page) => {
      const ids = served.slice(page * size, (page + 1) * size)
      const { coins } = Prices.parse(await fetch('llama', `/prices/current/${ids.join(',')}`))
      return ids.flatMap((id) => (coins[id] ? [[id, coins[id].price] as const] : []))
    }),
  )
  return new Map(pages.flat())
}

export async function chart(
  fetch: Fetch,
  assetId: CanonicalId,
  from: Day,
  to: Day,
): Promise<[Day, number][]> {
  if (!assetId.startsWith('coingecko:')) return []
  const start = Date.parse(from) / 1000 + 43_200
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1
  const path = `/chart/${assetId}?start=${start}&span=${span}&period=1d` as const
  const { coins } = Chart.parse(await fetch('llama', path))
  return (coins[assetId]?.prices ?? []).map(({ timestamp, price }) => [
    dayOf(timestamp * 1000),
    price,
  ])
}

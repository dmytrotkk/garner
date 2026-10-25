import { z } from '../core/zod'
import type { Fetch } from './host'
import type { AssetId } from './schema'

export type Coin = { coin: string; symbol: string; name: string; rank: number }

const Platforms = z.array(
  z.object({
    id: z.string(),
    chain_identifier: z.number().nullable(),
    native_coin_id: z.string().nullable(),
  }),
)

const Coins = z.array(
  z.object({
    id: z.string(),
    symbol: z.string(),
    name: z.string(),
    platforms: z.record(z.string(), z.string().nullable()),
  }),
)

const Ranked = z.array(z.object({ id: z.string() })).length(250)

const pages = 4

export async function coins(fetch: Fetch): Promise<Map<AssetId, Coin>> {
  const platforms = Platforms.parse(await fetch('coingecko', '/asset_platforms'))
  const list = Coins.parse(await fetch('coingecko', '/coins/list?include_platform=true'))
  const ranked: { id: string }[] = []
  for (let page = 1; page <= pages; page++)
    ranked.push(
      ...Ranked.parse(
        await fetch(
          'coingecko',
          `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`,
        ),
      ),
    )
  const ranks = new Map(ranked.map(({ id }, index) => [id, index + 1]))
  const byPlatform = new Map(platforms.map((platform) => [platform.id, platform]))
  const byAsset = new Map<AssetId, Coin>()

  for (const { id, symbol, name, platforms } of list) {
    const rank = ranks.get(id)
    if (!rank) continue
    const coin = { coin: id, symbol, name, rank }
    byAsset.set(`coingecko:${id}`, coin)
    for (const [platform, address] of Object.entries(platforms)) {
      const { chain_identifier: chainId, native_coin_id } = byPlatform.get(platform) ?? {}
      if (chainId && address && native_coin_id !== id)
        byAsset.set(`eip155:${chainId}/erc20:${address.toLowerCase()}`, coin)
    }
  }

  for (const { chain_identifier, native_coin_id } of platforms) {
    const coin = native_coin_id ? byAsset.get(`coingecko:${native_coin_id}`) : undefined
    if (chain_identifier && coin) byAsset.set(`eip155:${chain_identifier}/native`, coin)
  }

  return byAsset
}

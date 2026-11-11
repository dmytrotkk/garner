import type { Db } from './db.ts'
import type { Icon } from './host.ts'
import { q } from './schema.ts'

const native = '0x0000000000000000000000000000000000000000'
const deployment = /^eip155:(\d+)\/(?:erc20:(0x[0-9a-f]{40})|native)$/

const deployments = (coin: string) =>
  q
    .selectFrom('token')
    .select('id')
    .where('coin', '=', coin)
    .where('id', 'not like', 'coingecko:%')
    .union(
      q
        .selectFrom('asset')
        .select('id')
        .where('canonical', '=', `coingecko:${coin}`)
        .whereRef('id', '<>', 'canonical'),
    )
    .orderBy('id')
    .limit(1)

export async function icon(db: Db, load: Icon, id: string): ReturnType<Icon> {
  const coin = /^coingecko:([\w-]+)$/.exec(id)?.[1]
  if (!coin) return null
  const [row] = await db.read(deployments(coin))
  const [, chain, address = native] = (row && deployment.exec(row.id)) ?? []
  return load(coin, chain ? `${chain}/${address}` : null)
}

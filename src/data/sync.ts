import { sql } from 'kysely'
import { backfill } from './backfill.ts'
import type { Db } from './db.ts'
import { decimals, holdings } from './evm.ts'
import { usdPer } from './frankfurter.ts'
import type { Fetch } from './host.ts'
import { ledger } from './ledger.ts'
import { prices } from './llama.ts'
import {
  type Asset,
  addAssets,
  bind,
  type CanonicalId,
  type DeploymentId,
  dayOf,
  q,
  quote,
  scale,
} from './schema.ts'
import { fiat, setSetting, settings } from './settings.ts'
import { tokens } from './tokens.ts'

const rule = { currency: 'EUR' } as const

type Observed = { accountId: string; assetId: DeploymentId; quantity: string }

const observe = (rows: readonly Observed[], time: number) =>
  bind(sql`insert into balance (accountId, assetId, day, time, quantity)
    select account.id, j.value ->> 'assetId', ${dayOf(time)}, ${time}, j.value ->> 'quantity'
    from json_each(${JSON.stringify(rows)}) as j
    join account on account.id = j.value ->> 'accountId'
    join asset on asset.id = j.value ->> 'assetId'
    where coalesce(
      (select quantity from balance
        where accountId = account.id and assetId = j.value ->> 'assetId' and time < ${time}
        order by day desc limit 1),
      '0') <> j.value ->> 'quantity'
    on conflict (accountId, assetId, day) do update
      set time = excluded.time, quantity = excluded.quantity
      where excluded.time > balance.time`)

export async function sync(db: Db, fetch: Fetch, now = new Date()): Promise<void> {
  const time = now.getTime()
  const day = dayOf(time)
  const accounts = await db.read(q.selectFrom('account').select(['id', 'address']))
  if (!accounts.length) return

  const byAsset = await tokens(db, fetch, time)
  const canonical = new Map(
    (await db.read(q.selectFrom('asset').select(['id', 'canonical']))).map((asset) => [
      asset.id,
      asset.canonical,
    ]),
  )
  const universe = new Set([...byAsset.keys(), ...canonical.keys()])
  const found = await Promise.all(
    accounts.flatMap(({ id, address }) =>
      address
        ? holdings(fetch, address, universe).then((list) =>
            list.map((held) => ({ accountId: id, ...held })),
          )
        : [],
    ),
  ).then((lists) => lists.flat())

  const nonzero = found.filter(({ quantity }) => quantity !== '0')
  const unknown = [...new Set(nonzero.map(({ assetId }) => assetId))].filter(
    (id) => !canonical.has(id),
  )
  const precision = await decimals(fetch, unknown)
  const assets: Asset[] = []
  for (const id of unknown) {
    const token = byAsset.get(id)
    const places = precision.get(id)
    if (!token || places === undefined) continue
    const root: CanonicalId = `coingecko:${token.coin}`
    const shared = { canonical: root, symbol: token.symbol.toUpperCase(), name: token.name }
    canonical.set(root, root).set(id, root)
    assets.push({ ...shared, id: root, decimals: scale }, { ...shared, id, decimals: places })
  }
  const observed = found.filter(({ assetId }) => canonical.has(assetId))

  const manual = new Set(accounts.flatMap(({ id, address }) => (address ? [] : id)))
  const held = (await ledger(db)).filter(
    ({ accountId, closings }) => manual.has(accountId) && closings.at(-1)?.quantity,
  )
  const { currency } = await settings(db)
  const fiats = [currency, rule.currency].filter((code) => code !== 'USD').map(fiat)
  const rated = fiats.map(({ canonical }) => canonical)
  const priced = [
    ...new Set([
      ...rated,
      ...[...nonzero, ...held].flatMap(({ assetId }) => canonical.get(assetId) ?? []),
    ]),
  ]
  const [spot, latest, past] = await Promise.all([
    prices(fetch, priced).catch(() => new Map<CanonicalId, number>()),
    Promise.all(
      priced.flatMap((assetId) =>
        assetId.startsWith('fiat:')
          ? usdPer(fetch, assetId.slice('fiat:'.length), day).then(
              ([published, usd]) => [{ assetId, day: published, usd }],
              () => [],
            )
          : [],
      ),
    ),
    backfill(db, fetch, rated, time),
  ])
  await db.write(
    addAssets([...assets, ...fiats]),
    observe(observed, time),
    quote([
      ...[...spot].map(([assetId, usd]) => ({ assetId, day, usd })),
      ...latest.flat(),
      ...past,
    ]),
    setSetting('syncedAt', time, time),
  )
}

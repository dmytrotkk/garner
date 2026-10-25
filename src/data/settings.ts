import { z } from '../core/zod'
import type { Db } from './db'
import { usdPer } from './frankfurter'
import type { Fetch } from './host'
import { addAssets, coin, dayOf, q, quote } from './schema'

export const currencies = ['USD', 'EUR'] as const
export type Currency = (typeof currencies)[number]

const Settings = z.object({
  currency: z.enum(currencies).catch('USD'),
  privacy: z.boolean().catch(false),
  syncedAt: z.number().nullable().catch(null),
  coinListFailure: z
    .object({ count: z.number().int().positive(), at: z.number() })
    .nullable()
    .catch(null),
})
export type Settings = z.infer<typeof Settings>

const names = new Intl.DisplayNames('en', { type: 'currency' })

export const fiat = (currency: string) =>
  coin(`fiat:${currency}`, currency, names.of(currency) ?? currency)

export async function settings(db: Db): Promise<Settings> {
  const rows = await db.read(q.selectFrom('setting').select(['key', 'value']))
  return Settings.parse(Object.fromEntries(rows.map(({ key, value }) => [key, JSON.parse(value)])))
}

export function setSetting<Key extends keyof Settings>(
  key: Key,
  value: Settings[Key],
  now = Date.now(),
) {
  const row = { value: JSON.stringify(value), updatedAt: now }
  return q
    .insertInto('setting')
    .values({ key, ...row })
    .onConflict((oc) => oc.column('key').doUpdateSet(row))
}

export async function setCurrency(db: Db, fetch: Fetch, currency: Currency, now = Date.now()) {
  if ((await settings(db)).currency === currency) return
  if (currency === 'USD') return db.write(setSetting('currency', currency, now))
  const [day, usd] = await usdPer(fetch, currency, dayOf(now))
  const asset = fiat(currency)
  await db.write(
    setSetting('currency', currency, now),
    addAssets(asset),
    quote([{ assetId: asset.canonical, day, usd }]),
  )
}

export async function display(db: Db, currency: Currency) {
  if (currency === 'USD') return { currency, rate: 1 }
  const [latest] = await db.read(
    q
      .selectFrom('price')
      .select('usd')
      .where('assetId', '=', `fiat:${currency}`)
      .orderBy('day', 'desc')
      .limit(1),
  )
  if (!latest) throw new Error(`No rate stored for ${currency}.`)
  return { currency, rate: 1 / latest.usd }
}

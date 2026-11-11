import { expect, test } from 'bun:test'
import { coin, migrated } from '../../host/fresh.ts'
import { gate } from './gate.ts'
import type { Fetch } from './host.ts'
import { q } from './schema.ts'
import { display, setCurrency, setSetting, settings } from './settings.ts'

test('settings have defaults, persist, and fall back on a value this version does not know', async () => {
  const db = await migrated()
  expect(await settings(db)).toEqual({
    currency: 'USD',
    privacy: false,
    syncedAt: null,
    coinListFailure: null,
  })

  await db.write(setSetting('currency', 'EUR', 1), setSetting('privacy', true, 1))
  await db.write(setSetting('privacy', false, 2))
  expect(await settings(db)).toEqual({
    currency: 'EUR',
    privacy: false,
    syncedAt: null,
    coinListFailure: null,
  })
  expect(await db.read(q.selectFrom('setting').select('updatedAt').orderBy('key'))).toEqual([
    { updatedAt: 1 },
    { updatedAt: 2 },
  ])

  await db.write(q.updateTable('setting').set({ value: '"GBP"' }).where('key', '=', 'currency'))
  expect(await settings(db)).toEqual({
    currency: 'USD',
    privacy: false,
    syncedAt: null,
    coinListFailure: null,
  })
})

test('the display rate is the latest stored one, and a currency without a rate is refused', async () => {
  const db = await migrated()
  expect(await display(db, 'USD')).toEqual({ currency: 'USD', rate: 1 })
  await expect(display(db, 'EUR')).rejects.toThrow('No rate stored for EUR.')

  await db.write(
    q.insertInto('asset').values(coin('fiat:EUR', 'EUR')),
    q.insertInto('price').values([
      { assetId: 'fiat:EUR', day: '2026-09-19', usd: 2 },
      { assetId: 'fiat:EUR', day: '2026-09-20', usd: 1.25 },
    ]),
  )
  expect(await display(db, 'EUR')).toEqual({ currency: 'EUR', rate: 0.8 })
})

const rate =
  (usd: number): Fetch =>
  async (provider) => {
    if (provider === 'frankfurter') return { date: '2026-09-18', rates: { USD: usd } }
    throw new Error('offline')
  }
const offline = gate(async () => ({ type: 'status', status: 503, retryAfter: null }))

test('switching the currency writes the setting, the fiat asset and the rate under its published day together, or nothing', async () => {
  const db = await migrated()
  const now = Date.parse('2026-09-20T12:00:00Z')
  await setCurrency(db, offline, 'USD', now)
  await expect(setCurrency(db, offline, 'EUR', now)).rejects.toThrow('Frankfurter is unavailable')
  expect(await db.read(q.selectFrom('setting').select('key'))).toEqual([])
  expect(await db.read(q.selectFrom('asset').select('id'))).toEqual([])

  await setCurrency(db, rate(1.25), 'EUR', now)
  expect((await settings(db)).currency).toBe('EUR')
  expect(await db.read(q.selectFrom('asset').selectAll())).toEqual([
    { id: 'fiat:EUR', canonical: 'fiat:EUR', symbol: 'EUR', name: 'Euro', decimals: 18 },
  ])
  expect(await db.read(q.selectFrom('price').select(['day', 'usd']))).toEqual([
    { day: '2026-09-18', usd: 1.25 },
  ])
  await setCurrency(db, offline, 'USD', now + 1)
  expect((await settings(db)).currency).toBe('USD')
})

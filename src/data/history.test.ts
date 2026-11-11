import { expect, test } from 'bun:test'
import { account, coin, held, institution, migrated, moved } from '../../host/fresh.ts'
import { history } from './history.ts'
import { portfolio } from './portfolio.ts'
import { type CanonicalId, type Day, q } from './schema.ts'
import { setSetting } from './settings.ts'

const eth = coin('coingecko:ethereum', 'ETH')
const usdc = coin('coingecko:usd-coin', 'USDC')
const baseEth = { ...eth, id: 'eip155:8453/native' as const }
const baseUsdc = { ...usdc, id: 'eip155:8453/erc20:0xa' as const, decimals: 6 }
const euro = coin('fiat:EUR', 'EUR')

const now = Date.parse('2026-09-23T12:00:00Z')
const days = (points: { day: Day; value: number }[]) => points.map(({ day }) => day)

async function open() {
  const db = await migrated()
  const price = (assetId: CanonicalId, day: Day, usd: number) => ({ assetId, day, usd })
  await db.write(
    q.insertInto('institution').values([institution('w1'), institution('w2')]),
    q.insertInto('account').values([account('a1', 'w1', '0x1'), account('a2', 'w2', '0x2')]),
    q.insertInto('asset').values([eth, usdc, baseEth, baseUsdc, euro]),
    q
      .insertInto('balance')
      .values([
        held('a1', baseEth.id, '2026-09-20', '2000000000000000000'),
        held('a2', baseUsdc.id, '2026-09-21', '100000000'),
        held('a1', baseEth.id, '2026-09-22', '1000000000000000000'),
        held('a2', baseUsdc.id, '2026-09-23', '0'),
      ]),
    q
      .insertInto('price')
      .values([
        price(eth.id, '2026-09-20', 2000),
        price(eth.id, '2026-09-22', 2500),
        price(usdc.id, '2026-09-22', 1),
      ]),
  )
  return db
}

test('each day values the carried balances at the carried price, never at a later one', async () => {
  const db = await open()
  expect(await history(db, {}, now)).toEqual({
    currency: 'USD',
    points: [
      { day: '2026-09-20', value: 4000 },
      { day: '2026-09-21', value: 4000 },
      { day: '2026-09-22', value: 2600 },
      { day: '2026-09-23', value: 2500 },
    ],
  })
})

test('movements change the day they are booked on, below zero included, and today matches the portfolio total', async () => {
  const db = await open()
  await db.write(
    q
      .insertInto('entry')
      .values([
        moved('a2', eth.id, '2026-09-21', '1000000000000000000'),
        moved('a2', eth.id, '2026-09-23', '-1500000000000000000'),
      ]),
  )
  const { points } = await history(db, {}, now)
  expect(points.map(({ value }) => value)).toEqual([4000, 6000, 5100, 1250])
  expect(points.at(-1)?.value).toBe((await portfolio(db)).total)
})

test('an institution starts at its own first balance', async () => {
  const db = await open()
  const { points } = await history(db, { institutionId: 'w2' }, now)
  expect(points.map(({ value }) => value)).toEqual([0, 100, 0])
  expect(days(points)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23'])
})

test('the cash scope values the currency lines alone', async () => {
  const db = await open()
  await db.write(
    q.insertInto('entry').values(moved('a2', euro.id, '2026-09-22', '100000000000000000000')),
    q.insertInto('price').values({ assetId: euro.id, day: '2026-09-22', usd: 1.25 }),
  )
  const { points } = await history(db, { cash: true }, now)
  expect(points).toEqual([
    { day: '2026-09-22', value: 125 },
    { day: '2026-09-23', value: 125 },
  ])
})

test('another display currency is refused without a rate, leaves out the days before its first rate and converts each day at the rate of that day', async () => {
  const db = await open()
  await db.write(setSetting('currency', 'EUR'))
  await expect(history(db, {}, now)).rejects.toThrow('No rate stored for EUR.')
  await db.write(q.insertInto('price').values({ assetId: euro.id, day: '2026-09-22', usd: 2.5 }))
  expect(await history(db, {}, now)).toEqual({
    currency: 'EUR',
    points: [
      { day: '2026-09-22', value: 1040 },
      { day: '2026-09-23', value: 1000 },
    ],
  })
  await db.write(q.insertInto('price').values({ assetId: euro.id, day: '2026-09-19', usd: 1.25 }))
  expect(await history(db, {}, now)).toEqual({
    currency: 'EUR',
    points: [
      { day: '2026-09-20', value: 3200 },
      { day: '2026-09-21', value: 3200 },
      { day: '2026-09-22', value: 1040 },
      { day: '2026-09-23', value: 1000 },
    ],
  })
})

test('nothing held means no points', async () => {
  expect(await history(await migrated(), {}, now)).toEqual({ currency: 'USD', points: [] })
})

import { expect, test } from 'bun:test'
import { account, coin, institution, migrated } from '../../host/fresh.ts'
import { fold, ledger, movements } from './ledger.ts'
import { type AssetId, dayOf, q } from './schema.ts'

const euro = 'fiat:EUR' as const
const open = (party: string, ref: string, fee = 0n) => ({
  accountId: 'a1',
  kind: 'transfer' as const,
  key: { accountId: 'a1', ref, leg: 'amount' },
  fee,
  party,
  assignment: { state: 'open' as const, party },
  identity: { state: 'open' as const },
  note: null,
})
const at = (day: number, hour = 12) => Date.UTC(2026, 0, day, hour)
const fact = (time: number, quantity: bigint, accountId = 'a1', assetId: AssetId = euro) => ({
  accountId,
  assetId,
  time,
  quantity: String(quantity),
})

test('a line with observations alone is outside the ledger and closes at what was seen', () => {
  expect(fold([], [fact(at(3), 70n), fact(at(1), 100n), fact(at(1, 9), 90n)])).toEqual([
    {
      accountId: 'a1',
      assetId: euro,
      closings: [
        { day: '2026-01-01', quantity: 100n },
        { day: '2026-01-03', quantity: 70n },
      ],
      coverage: { state: 'outside' },
    },
  ])
})

test('movements alone run from zero, and a sum below zero is a closing like any other', () => {
  const [line] = fold([fact(at(1), 50n), fact(at(1, 15), -20n), fact(at(4), -45n)], [])
  expect(line?.closings).toEqual([
    { day: '2026-01-01', quantity: 30n },
    { day: '2026-01-04', quantity: -15n },
  ])
  expect(line?.coverage).toEqual({
    state: 'ledger',
    from: at(1),
    to: at(4),
    opening: 0n,
    holes: [],
  })
})

test('a window that starts mid-history opens at the first observation minus what moved before it', () => {
  const moves = [fact(at(2, 9), -5n), fact(at(2), -3n), fact(at(3), 10n)]
  const [line] = fold(moves, [fact(at(2), 92n), fact(at(3), 102n)])
  expect(line?.closings).toEqual([
    { day: '2026-01-02', quantity: 92n },
    { day: '2026-01-03', quantity: 102n },
  ])
  expect(line?.coverage).toEqual({
    state: 'ledger',
    from: at(2, 9),
    to: at(3),
    opening: 100n,
    holes: [],
  })
})

test('closings start at the first fact, from the opening', () => {
  const [line] = fold([fact(at(1), -5n), fact(at(3), -3n)], [fact(at(3), 92n)])
  expect(line?.closings).toEqual([
    { day: '2026-01-01', quantity: 95n },
    { day: '2026-01-03', quantity: 92n },
  ])
})

test('a movement after an observation adds to it, the same day included', () => {
  const [line] = fold([fact(at(1, 15), -5n)], [fact(at(1), 40n)])
  expect(line?.closings).toEqual([{ day: '2026-01-01', quantity: 35n }])
  expect(line?.coverage).toMatchObject({ from: at(1), to: at(1, 15), opening: 40n, holes: [] })
})

test('an observation that disagrees is a hole since the one before it, and the sum follows it', () => {
  const moves = [fact(at(1), 5n), fact(at(3), 5n), fact(at(7), -1n)]
  const seen = [fact(at(2), 50n), fact(at(4), 60n), fact(at(5), 60n), fact(at(6), 61n)]
  const [line] = fold(moves, seen)
  expect(line?.closings.map(({ quantity }) => quantity)).toEqual([
    50n,
    50n,
    55n,
    60n,
    60n,
    61n,
    60n,
  ])
  expect(line?.coverage).toEqual({
    state: 'ledger',
    from: at(1),
    to: at(7),
    opening: 45n,
    holes: [
      { from: at(2), to: at(4), quantity: 5n },
      { from: at(5), to: at(6), quantity: 1n },
    ],
  })
})

test('lines are kept apart by account and asset, and the order of the facts never matters', () => {
  const moves = [
    fact(at(1), -10n),
    fact(at(2), 7n),
    fact(at(2, 13), 3n, 'a2'),
    fact(at(2, 14), 1n, 'a1', 'coingecko:bitcoin'),
  ]
  const seen = [fact(at(1), 90n), fact(at(2), 99n), fact(at(3), 5n, 'a2')]
  const lines = fold(moves, seen)
  expect(
    lines.map(({ accountId, assetId, closings }) => [accountId, assetId, closings.at(-1)]),
  ).toEqual([
    ['a1', euro, { day: '2026-01-02', quantity: 99n }],
    ['a2', euro, { day: '2026-01-03', quantity: 5n }],
    ['a1', 'coingecko:bitcoin', { day: '2026-01-02', quantity: 1n }],
  ])
  expect(lines[0]?.coverage).toMatchObject({ holes: [{ from: at(1), to: at(2), quantity: 2n }] })
  expect(lines[1]?.coverage).toMatchObject({ opening: 2n, holes: [] })
  expect(fold(moves.toReversed(), seen.toReversed())).toEqual(lines)
})

test('the ledger of an institution folds the entries and balances of its accounts only, and movements list an account newest first, one row per event', async () => {
  const db = await migrated()
  const entry = (accountId: string, time: number, quantity: string) => ({
    accountId,
    ref: `row:${time}`,
    leg: 'amount',
    time,
    kind: 'transfer' as const,
    assetId: euro,
    quantity,
  })
  await db.write(
    q.insertInto('institution').values([institution('w1'), institution('w2')]),
    q.insertInto('account').values([account('a1', 'w1'), account('a2', 'w2')]),
    q.insertInto('asset').values(coin(euro, 'EUR')),
    q.insertInto('entry').values([entry('a1', at(1), '-10'), entry('a2', at(1), '4')]),
    q
      .insertInto('balance')
      .values({ accountId: 'a1', assetId: euro, day: dayOf(at(1)), time: at(1), quantity: '-3' }),
  )
  expect(await ledger(db, 'w1')).toEqual([
    {
      accountId: 'a1',
      assetId: euro,
      closings: [{ day: '2026-01-01', quantity: -3n }],
      coverage: { state: 'ledger', from: at(1), to: at(1), opening: 7n, holes: [] },
    },
  ])
  expect((await ledger(db)).map(({ accountId }) => accountId)).toEqual(['a1', 'a2'])

  const leg = (ref: string, name: string, time: number, quantity: string, memo: string | null) => ({
    ...entry('a1', time, quantity),
    ref,
    leg: name,
    kind: name === 'fee' ? ('fee' as const) : ('transfer' as const),
    memo,
  })
  await db.write(
    q
      .insertInto('entry')
      .values([
        leg('row:b', 'amount', at(3), '-50', 'Exchange'),
        leg('row:b', 'fee', at(3), '-1', 'Exchange'),
        leg('row:c', 'amount', at(4), '9', null),
      ]),
  )
  expect(await movements(db, { accountId: 'a1' })).toEqual([
    {
      ref: 'row:c',
      time: at(4),
      memo: null,
      assetId: euro,
      quantity: 9n,
      ...open('', 'row:c'),
      transfer: { state: 'unmatched' },
    },
    {
      ref: 'row:b',
      time: at(3),
      memo: 'Exchange',
      assetId: euro,
      quantity: -51n,
      ...open('exchange', 'row:b', -1n),
      transfer: { state: 'unmatched' },
    },
    {
      ref: `row:${at(1)}`,
      time: at(1),
      memo: null,
      assetId: euro,
      quantity: -10n,
      ...open('', `row:${at(1)}`),
      transfer: { state: 'unmatched' },
    },
  ])
  expect(await movements(db, { accountId: 'a2' })).toHaveLength(1)
  expect(await movements(db, { cash: true })).toHaveLength(4)
})

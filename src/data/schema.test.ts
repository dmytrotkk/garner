import { expect, test } from 'bun:test'
import { coin, fresh, institution, migrated } from '../../host/fresh'
import { builder, createDb } from './db'
import { type Account, type Asset, dayOf, migrations, q, type Schema } from './schema'

const evm: Account = {
  id: 'a1',
  institutionId: 'w1',
  name: 'ledger',
  kind: 'evm',
  address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  updatedAt: 1,
}
const manual: Account = { ...evm, id: 'a2', name: 'cold', kind: 'manual', address: null }

const usdc = coin('coingecko:usd-coin', 'USDC', 'USD Coin')
const usdcBase = {
  ...usdc,
  id: 'eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as const,
  decimals: 6,
}
const euro = coin('fiat:EUR', 'EUR', 'Euro')
const noon = Date.parse('2026-09-20T12:00:00Z')

const account = (row: Schema['account']) => q.insertInto('account').values(row)
const asset = (row: Schema['asset']) => q.insertInto('asset').values(row)
const balance = (quantity: string, row: Partial<Schema['balance']> = {}) =>
  q.insertInto('balance').values({
    accountId: evm.id,
    assetId: usdcBase.id,
    day: dayOf(noon),
    time: noon,
    quantity,
    ...row,
  })
const entry = (row: Partial<Schema['entry']> = {}) =>
  q.insertInto('entry').values({
    accountId: manual.id,
    ref: 'row:20260920120000:EUR:-4.5:0',
    leg: 'amount',
    time: noon,
    kind: 'transfer',
    assetId: euro.id,
    quantity: '-4500000000000000000',
    memo: 'Cafe Lisboa',
    ...row,
  })
const kept = (row: Partial<Schema['import']> = {}) =>
  q.insertInto('import').values({
    id: 'i1',
    name: 'statement.csv',
    raw: 'Date,Amount',
    tickers: '{}',
    accounts: '{"Current":"a2"}',
    ...row,
  })
const decision = (peer: string | null) =>
  q.insertInto('decision').values({
    accountId: manual.id,
    ref: 'row:1',
    leg: 'amount',
    kind: peer ? 'paired' : 'external',
    peerAccountId: peer,
    peerRef: peer ? 'row:2' : null,
    peerLeg: peer ? 'amount' : null,
  })

async function open() {
  const db = await migrated()
  await db.write(
    q.insertInto('institution').values(institution('w1', 'main')),
    account(evm),
    account(manual),
    asset(usdc),
    asset(usdcBase),
    asset(euro),
  )
  return db
}

test('deleting an account deletes its balances, its entries and the decisions that name it', async () => {
  const db = await open()
  await db.write(balance('1'), entry({ accountId: evm.id }), decision(evm.id))
  await db.write(q.deleteFrom('account').where('id', '=', evm.id))
  expect(await db.read(q.selectFrom('balance').selectAll())).toEqual([])
  expect(await db.read(q.selectFrom('entry').selectAll())).toEqual([])
  expect(await db.read(q.selectFrom('decision').selectAll())).toEqual([])
})

test('accepts an overdrawn fiat balance, legs of every kind, an import and both decisions, and never the same leg twice', async () => {
  const db = await open()
  await db.write(
    balance('-1', { accountId: manual.id, assetId: euro.id }),
    entry({ leg: 'out' }),
    entry({ leg: 'in', quantity: '1', peer: 'PT50 0002', memo: null }),
    entry({ leg: 'fee', kind: 'fee', quantity: '-1' }),
    entry({ leg: 'income', kind: 'income', quantity: '1' }),
    entry({ leg: 'trade', kind: 'trade', quantity: '1' }),
    kept(),
    decision(null),
  )
  await db.write(q.deleteFrom('decision'), decision(evm.id))
  expect(await db.read(q.selectFrom('entry').select('leg'))).toHaveLength(5)
  await expect(db.write(entry({ leg: 'out', quantity: '-1' }))).rejects.toThrow()
})

test.each([
  ['evm account without an address', account({ ...evm, id: 'x', address: null })],
  ['manual account with an address', account({ ...manual, id: 'x', address: '0xabc' })],
  ['checksummed address', account({ ...evm, id: 'x', address: '0xD8dA6BF2' })],
  ['duplicate address', account({ ...evm, id: 'x' })],
  ['canonical asset that points at another', asset({ ...usdc, id: 'coingecko:x' })],
  [
    'deployment that points at a deployment',
    asset({ ...usdcBase, id: 'eip155:1/erc20:0x1', canonical: usdcBase.id as never }),
  ],
  [
    'deployment that points at itself',
    asset({ ...usdcBase, id: 'eip155:1/native', canonical: 'eip155:1/native' as never }),
  ],
  [
    'asset whose canonical row is missing',
    asset({ ...usdcBase, id: 'eip155:1/native', canonical: 'coingecko:missing' }),
  ],
  ['impossible day', balance('1', { day: '2026-02-30' })],
  ['unpadded day', balance('1', { day: '2026-9-20' })],
  ['day that is not the day of its time', balance('1', { day: '2026-09-21' })],
  ['balance at time zero', balance('1', { day: '1970-01-01', time: 0 })],
  ['decimal quantity', balance('1.5')],
  ['negative quantity of a coin', balance('-1')],
  ['empty quantity', balance('')],
  ['quantity with a leading zero', balance('01')],
  ['negative zero', balance('-0', { accountId: manual.id, assetId: euro.id })],
  ['negative fiat with a leading zero', balance('-01', { accountId: manual.id, assetId: euro.id })],
  ['leg without a ref', entry({ ref: '' })],
  ['leg without a name', entry({ leg: '' })],
  ['leg at time zero', entry({ time: 0 })],
  ['leg of an unknown kind', entry({ kind: 'internal' as never })],
  ['leg of an unknown account', entry({ accountId: 'a9' })],
  ['leg of an unknown asset', entry({ assetId: 'fiat:XXX' })],
  ['leg that moves nothing', entry({ quantity: '0' })],
  ['leg with a decimal quantity', entry({ quantity: '-4.5' })],
  ['leg with a leading zero', entry({ quantity: '-045' })],
  ['fee that adds', entry({ kind: 'fee', quantity: '1' })],
  ['income that takes', entry({ kind: 'income', quantity: '-1' })],
  ['empty memo', entry({ memo: '' })],
  ['untrimmed memo', entry({ memo: ' Cafe' })],
  ['empty peer', entry({ peer: '' })],
  ['untrimmed peer', entry({ peer: 'PT50 ' })],
  ['import without a name', kept({ name: '' })],
  ['import without content', kept({ raw: '' })],
  ['tickers that are not an object', kept({ tickers: '[]' })],
  ['accounts that are not an object', kept({ accounts: '"a2"' })],
  ['decision that names its own account', decision(manual.id)],
  ['decision that names an unknown account', decision('a9')],
])('rejects %s', async (_, query) => {
  const db = await open()
  await expect(db.write(query)).rejects.toThrow()
})

test('migration 2 moves existing accounts into a Main institution and keeps their balances', async () => {
  const db = createDb(fresh())
  await db.migrate(migrations.slice(0, 2))
  const legacy = builder<{
    account: Omit<Account, 'institutionId'>
    asset: Omit<Asset, 'canonical'> & { parent: string | null; logo: null; hidden: 0 }
    balance: Omit<Schema['balance'], 'time'>
  }>()
  const { institutionId: _, ...old } = evm
  const { canonical, ...bare } = usdc
  await db.write(
    legacy.insertInto('account').values(old),
    legacy.insertInto('asset').values([
      { ...bare, parent: null, logo: null, hidden: 0 },
      { ...bare, id: usdcBase.id, parent: canonical, logo: null, hidden: 0 },
    ]),
    legacy
      .insertInto('balance')
      .values({ accountId: evm.id, assetId: usdcBase.id, day: '2026-09-20', quantity: '7' }),
  )
  await db.migrate(migrations)

  expect(await db.read(q.selectFrom('institution').select('name'))).toEqual([{ name: 'Main' }])
  expect(await db.read(q.selectFrom('account').select(['id', 'institutionId', 'address']))).toEqual(
    [{ id: evm.id, institutionId: '00000000-0000-7000-8000-000000000000', address: evm.address }],
  )
  expect(await db.read(q.selectFrom('balance').select('quantity'))).toEqual([{ quantity: '7' }])
  await db.write(q.deleteFrom('institution'))
  expect(await db.read(q.selectFrom('balance').selectAll())).toEqual([])
})

const before = builder<{
  wallet: Schema['institution']
  account: Omit<Schema['account'], 'institutionId'> & { walletId: string; syncedAt: number | null }
  asset: Omit<Asset, 'canonical'> & { parent: string | null }
  balance: Omit<Schema['balance'], 'time'>
}>()

const prior = ({ institutionId, ...account }: Account, syncedAt: number | null) => ({
  ...account,
  walletId: institutionId,
  syncedAt,
})

async function old() {
  const db = createDb(fresh())
  await db.migrate(migrations.slice(0, 7))
  const { canonical, ...bare } = usdc
  await db.write(
    before.insertInto('wallet').values(institution('w1', 'main')),
    before.insertInto('account').values([prior(evm, 5), prior(manual, null)]),
    before.insertInto('asset').values([
      { ...bare, parent: null },
      { ...bare, id: usdcBase.id, parent: canonical, decimals: 6 },
      { ...bare, id: euro.id, parent: null, symbol: 'EUR', name: 'Euro', decimals: 2 },
    ]),
    q.insertInto('price').values({ assetId: usdc.id, day: '2026-09-19', usd: 1 }),
    q.insertInto('setting').values([
      { key: 'mcpToken', value: '"secret"', updatedAt: 1 },
      { key: 'currency', value: '"EUR"', updatedAt: 1 },
    ]),
  )
  const held = (accountId: string, assetId: Asset['id'], day: Schema['balance']['day']) =>
    before.insertInto('balance').values({ accountId, assetId, day, quantity: '1500000' })
  return { db, held }
}

test('migration 7 rebuilds asset and balance, moves fiat to 18 decimals, drops syncedAt and the mcpToken row, and migration 9 renames wallet to institution', async () => {
  const { db, held } = await old()
  const today = dayOf(Date.now())
  await db.write(
    held(evm.id, usdcBase.id, '2026-09-19'),
    held(evm.id, usdcBase.id, today),
    held(manual.id, usdc.id, '2026-09-19'),
  )
  await db.migrate(migrations)

  expect(await db.read(q.selectFrom('asset').selectAll().orderBy('id'))).toEqual([
    usdc,
    usdcBase,
    euro,
  ])
  const [first, second, last] = await db.read(
    q.selectFrom('balance').selectAll().orderBy('time').orderBy('accountId'),
  )
  const stamped = {
    day: '2026-09-19' as const,
    time: Date.parse('2026-09-20') - 1,
    quantity: '1500000',
  }
  expect(first).toEqual({ accountId: evm.id, assetId: usdcBase.id, ...stamped })
  expect(second).toEqual({ accountId: manual.id, assetId: usdc.id, ...stamped })
  expect(last?.day).toBe(dayOf(last?.time ?? 0))
  expect(last?.time).toBeLessThanOrEqual(Date.now())
  expect(await db.read(q.selectFrom('institution').selectAll())).toEqual([
    { id: 'w1', name: 'main', updatedAt: 1 },
  ])
  expect(await db.read(q.selectFrom('account').selectAll().orderBy('id'))).toEqual([evm, manual])
  expect(await db.read(q.selectFrom('setting').select('key'))).toEqual([{ key: 'currency' }])
  expect(await db.read(q.selectFrom('price').select('usd'))).toEqual([{ usd: 1 }])
})

test('migration 7 stops at a fiat balance and leaves the database as it was', async () => {
  const { db, held } = await old()
  await db.write(held(manual.id, euro.id, '2026-09-19'))
  await expect(db.migrate(migrations)).rejects.toThrow()
  expect(
    await db.read(before.selectFrom('asset').select('parent').where('id', '=', euro.id)),
  ).toEqual([{ parent: null }])
  expect(await db.read(before.selectFrom('balance').select('quantity'))).toEqual([
    { quantity: '1500000' },
  ])
})

test('migration 8 drops the weekday rates an older sync may have stored a day late and keeps the newest of each currency', async () => {
  const db = createDb(fresh())
  await db.migrate(migrations.slice(0, 8))
  const rate = (assetId: Schema['price']['assetId'], day: Schema['price']['day']) => ({
    assetId,
    day,
    usd: 1.1,
  })
  await db.write(
    asset(usdc),
    asset(euro),
    q
      .insertInto('price')
      .values([
        rate(euro.canonical, '2026-09-25'),
        rate(euro.canonical, '2026-09-26'),
        rate(euro.canonical, '2026-09-28'),
        rate(euro.canonical, '2026-09-29'),
        rate(usdc.id, '2026-09-24'),
        rate(usdc.id, '2026-09-25'),
      ]),
  )
  await db.migrate(migrations)
  expect(
    await db.read(
      q.selectFrom('price').select(['assetId', 'day']).orderBy('day').orderBy('assetId'),
    ),
  ).toEqual([
    { assetId: usdc.id, day: '2026-09-24' },
    { assetId: usdc.id, day: '2026-09-25' },
    { assetId: euro.canonical, day: '2026-09-26' },
    { assetId: euro.canonical, day: '2026-09-29' },
  ])
})

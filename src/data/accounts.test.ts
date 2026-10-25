import { expect, test } from 'bun:test'
import { formatUnits } from 'viem'
import { coin, held, migrated, moved } from '../../host/fresh'
import {
  createEvmAccount,
  createInstitution,
  createManualAccount,
  remove,
  rename,
  setHolding,
} from './accounts'
import { portfolio } from './portfolio'
import { q } from './schema'

const address = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const eth = coin('coingecko:ethereum', 'ETH')
const baseEth = { ...eth, id: 'eip155:8453/native' as const }
const bitcoin = 'coingecko:bitcoin' as const

async function open() {
  const db = await migrated()
  const institution = await createInstitution(db, ' ledger ', 1_000)
  const account = await createEvmAccount(db, institution.id, address, 'main', 2_000)
  await db.write(
    q.insertInto('asset').values([eth, baseEth]),
    q.insertInto('balance').values(held(account.id, baseEth.id, '2026-09-20', '1')),
    q.insertInto('price').values({ assetId: eth.id, day: '2026-09-20', usd: 2500 }),
    q
      .insertInto('token')
      .values({ id: bitcoin, coin: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1, seenAt: 1 }),
  )
  const empty = async (
    tables: readonly ('institution' | 'account' | 'balance' | 'asset' | 'price')[],
  ) => {
    for (const table of tables) expect(await db.read(q.selectFrom(table).selectAll())).toEqual([])
  }
  return { db, institution, account, empty }
}

test('names are trimmed and never empty, ids must exist', async () => {
  const { db, institution, account } = await open()
  expect(institution).toMatchObject({ name: 'ledger', updatedAt: 1_000 })
  await expect(createInstitution(db, ' ')).rejects.toThrow('Enter a name.')
  await expect(rename(db, 'institution', institution.id, '')).rejects.toThrow('Enter a name.')
  await expect(rename(db, 'institution', 'w9', 'cold')).rejects.toThrow('Unknown institution.')
  await expect(remove(db, 'account', 'a9')).rejects.toThrow('Unknown account.')
  await expect(createManualAccount(db, institution.id, ' ')).rejects.toThrow('Enter a name.')
  const pasted = await createEvmAccount(
    db,
    institution.id,
    ' 0x71C7656EC7ab88b098defB751B7401B5f6d8976F\n',
  )
  expect(pasted.address).toBe('0x71c7656ec7ab88b098defb751b7401b5f6d8976f')

  expect(await rename(db, 'institution', institution.id, ' cold ', 3_000)).toEqual({
    id: institution.id,
    name: 'cold',
  })
  expect(await db.read(q.selectFrom('institution').select(['name', 'updatedAt']))).toEqual([
    { name: 'cold', updatedAt: 3_000 },
  ])
  await rename(db, 'account', account.id, 'savings', 3_000)
  expect(
    await db.read(
      q.selectFrom('account').select(['name', 'updatedAt']).where('id', '=', account.id),
    ),
  ).toEqual([{ name: 'savings', updatedAt: 3_000 }])
})

test('removing an account keeps its institution and leaves no other trace', async () => {
  const { db, account, empty } = await open()
  await remove(db, 'account', account.id)
  await empty(['account', 'balance', 'asset', 'price'])
  expect(await db.read(q.selectFrom('institution').select('name'))).toEqual([{ name: 'ledger' }])
})

test('removing an institution removes its accounts and everything they held', async () => {
  const { db, institution, empty } = await open()
  await remove(db, 'institution', institution.id)
  await empty(['institution', 'account', 'balance', 'asset', 'price'])
})

test('a coin another account holds through movements keeps its row and its prices', async () => {
  const { db, institution, account } = await open()
  const bank = await createManualAccount(db, institution.id, 'Kraken', 3_000)
  await db.write(q.insertInto('entry').values(moved(bank.id, eth.id, '2026-09-20', '1')))
  await remove(db, 'account', account.id)
  expect(await db.read(q.selectFrom('asset').select('id'))).toEqual([{ id: eth.id }])
  expect(await db.read(q.selectFrom('price').select('assetId'))).toEqual([{ assetId: eth.id }])
})

test('currency rates outlive the accounts', async () => {
  const { db, institution } = await open()
  await db.write(
    q.insertInto('asset').values(coin('fiat:EUR', 'EUR')),
    q.insertInto('price').values({ assetId: 'fiat:EUR', day: '2026-09-20', usd: 1.25 }),
  )
  await remove(db, 'institution', institution.id)
  expect(await db.read(q.selectFrom('price').select('assetId'))).toEqual([{ assetId: 'fiat:EUR' }])
  expect(await db.read(q.selectFrom('asset').select('id'))).toEqual([{ id: 'fiat:EUR' }])
})

test('a holding held since a day is recorded on that day at noon and again now, never after today', async () => {
  const { db, institution } = await open()
  const now = Date.parse('2026-09-25T08:30:00Z')
  const cold = await createManualAccount(db, institution.id, 'Cold', 3_000)
  const rows = () =>
    db.read(
      q
        .selectFrom('balance')
        .select(['day', 'time'])
        .where('accountId', '=', cold.id)
        .orderBy('time'),
    )
  await expect(setHolding(db, cold.id, bitcoin, '1', '2026-09-26', now)).rejects.toThrow(
    'Choose a day',
  )
  await expect(setHolding(db, cold.id, bitcoin, '1', '2026-02-30x', now)).rejects.toThrow(
    'Choose a day',
  )
  await setHolding(db, cold.id, bitcoin, '1', '2026-09-25', now)
  expect(await rows()).toEqual([{ day: '2026-09-25', time: now }])
  await setHolding(db, cold.id, bitcoin, '1', '2021-03-01', now + 1)
  expect(await rows()).toEqual([
    { day: '2021-03-01', time: Date.parse('2021-03-01T12:00:00Z') },
    { day: '2026-09-25', time: now + 1 },
  ])
})

test('a manual account holds coins entered by hand, one balance per day', async () => {
  const { db, institution } = await open()
  const day = Date.parse('2026-09-25T12:00:00Z')
  await expect(createManualAccount(db, 'w9', 'Coinbase')).rejects.toThrow('Unknown institution.')
  const manual = await createManualAccount(db, institution.id, 'Coinbase', 3_000)
  expect(manual).toMatchObject({ name: 'Coinbase', kind: 'manual', address: null })

  await setHolding(db, manual.id, bitcoin, '0.5', undefined, day)
  await setHolding(db, manual.id, bitcoin, '0.75', undefined, day + 1)
  await expect(setHolding(db, manual.id, bitcoin, '1,5', undefined, day)).rejects.toThrow(
    'Enter an amount',
  )
  await expect(setHolding(db, 'a9', bitcoin, '1', undefined, day)).rejects.toThrow(
    'Unknown account.',
  )
  await expect(setHolding(db, manual.id, 'coingecko:nope', '1', undefined, day)).rejects.toThrow(
    'Unknown asset.',
  )
  await expect(setHolding(db, 'a9', bitcoin, '0', undefined, day)).rejects.toThrow(
    'Unknown account.',
  )
  expect(
    await db.read(q.selectFrom('asset').select(['symbol', 'decimals']).where('id', '=', bitcoin)),
  ).toEqual([{ symbol: 'BTC', decimals: 18 }])
  expect(
    await db.read(
      q
        .selectFrom('balance')
        .select(['day', 'time', 'quantity'])
        .where('accountId', '=', manual.id),
    ),
  ).toEqual([{ day: '2026-09-25', time: day + 1, quantity: '750000000000000000' }])

  await db.write(
    q.insertInto('price').values({ assetId: bitcoin, day: '2026-09-25', usd: 100_000 }),
  )
  expect((await portfolio(db)).holdings[0]).toMatchObject({
    id: bitcoin,
    amount: 0.75,
    value: 75_000,
  })
  await setHolding(db, manual.id, bitcoin, '0', undefined, day + 86_400_000)
  expect((await portfolio(db)).holdings).toEqual([])
})

test('a manual holding reads back exactly as typed', async () => {
  const { db, institution } = await open()
  const manual = await createManualAccount(db, institution.id, 'Coinbase', 3_000)
  for (const amount of ['25000', '100000', '0.0000001', '0.75']) {
    await setHolding(db, manual.id, bitcoin, amount)
    const { institutions } = await portfolio(db)
    const account = institutions
      .flatMap(({ accounts }) => accounts)
      .find(({ id }) => id === manual.id)
    const [position] = account?.positions ?? []
    expect(position && formatUnits(BigInt(position.quantity), position.decimals)).toBe(amount)
  }
})

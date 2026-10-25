import { expect, test } from 'bun:test'
import { coin, held, institution, migrated, moved } from '../../host/fresh'
import { createEvmAccount, createManualAccount } from './accounts'
import { portfolio } from './portfolio'
import { q } from './schema'

const eth = coin('coingecko:ethereum', 'ETH')
const usdc = coin('coingecko:usd-coin', 'USDC')
const baseEth = { ...eth, id: 'eip155:8453/native' as const }
const baseUsdc = { ...usdc, id: 'eip155:8453/erc20:0xa' as const, decimals: 6 }
const bscUsdc = { ...usdc, id: 'eip155:56/erc20:0xb' as const }
const obscure = coin('coingecko:obscure', 'OBS')
const dust = coin('coingecko:dust', 'DUST')

async function open() {
  const db = await migrated()
  await db.write(
    q
      .insertInto('institution')
      .values([
        institution('w1', 'cold'),
        institution('w2', 'trading'),
        institution('w3', 'empty'),
      ]),
    q.insertInto('asset').values([eth, usdc, baseEth, baseUsdc, bscUsdc, obscure, dust]),
  )
  const { id: ledger } = await createEvmAccount(
    db,
    'w1',
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    'ledger',
    1_000,
  )
  const { id: hot } = await createEvmAccount(
    db,
    'w2',
    '0x71c7656ec7ab88b098defb751b7401b5f6d8976f',
    'hot',
    2_000,
  )
  await db.write(
    q
      .insertInto('balance')
      .values([
        held(ledger, baseEth.id, '2026-09-19', '9000000000000000000'),
        held(ledger, baseEth.id, '2026-09-20', '2000000000000000000'),
        held(ledger, baseUsdc.id, '2026-09-20', '1500000'),
        held(hot, bscUsdc.id, '2026-09-20', '500000000000000000'),
        held(hot, baseUsdc.id, '2026-09-20', '1000'),
        held(hot, obscure.id, '2026-09-20', '7000000000000000000'),
        held(hot, dust.id, '2026-09-20', '100000000000000'),
        held(hot, baseEth.id, '2026-09-19', '1000000000000000000'),
        held(hot, baseEth.id, '2026-09-20', '0'),
      ]),
    q.insertInto('price').values([
      { assetId: eth.id, day: '2026-09-19', usd: 1000 },
      { assetId: eth.id, day: '2026-09-20', usd: 2500 },
      { assetId: usdc.id, day: '2026-09-20', usd: 1 },
      { assetId: dust.id, day: '2026-09-20', usd: 1 },
    ]),
  )
  return db
}

test('institutions and their accounts are valued at latest balances and latest prices', async () => {
  const { total, institutions } = await portfolio(await open())
  expect(institutions).toMatchObject([
    { name: 'cold', value: 5001.5, accounts: [{ name: 'ledger', value: 5001.5 }] },
    { name: 'trading', value: 0.5011, accounts: [{ name: 'hot', value: 0.5011 }] },
    { name: 'empty', value: 0, accounts: [] },
  ])
  expect(total).toBe(5002.0011)
})

test('holdings roll up across institutions, chains and decimals, unpriced last, empty and dust excluded', async () => {
  const { holdings } = await portfolio(await open())
  expect(holdings).toMatchObject([
    {
      id: eth.id,
      symbol: 'ETH',
      name: 'ETH',
      amount: 2,
      price: 2500,
      value: 5000,
      share: 5000 / 5002.0011,
    },
    {
      id: usdc.id,
      symbol: 'USDC',
      name: 'USDC',
      amount: 2.001,
      price: 1,
      value: 2.001,
      share: 2.001 / 5002.0011,
    },
    {
      id: obscure.id,
      symbol: 'OBS',
      name: 'OBS',
      amount: 7,
      price: null,
      value: null,
      share: null,
    },
  ])
})

test('a holding lists where it sits by account and deployment, largest first, dust left out', async () => {
  const { holdings } = await portfolio(await open())
  expect(holdings.map(({ positions }) => positions)).toMatchObject([
    [
      {
        account: 'ledger',
        institution: 'cold',
        institutionId: 'w1',
        assetId: baseEth.id,
        amount: 2,
      },
    ],
    [
      { account: 'ledger', institution: 'cold', assetId: baseUsdc.id, amount: 1.5, value: 1.5 },
      { account: 'hot', institution: 'trading', assetId: bscUsdc.id, amount: 0.5, value: 0.5 },
    ],
    [{ account: 'hot', institution: 'trading', assetId: obscure.id, amount: 7, value: null }],
  ])
})

test('a typed holding is never hidden as dust', async () => {
  const db = await open()
  const manual = await createManualAccount(db, 'w3', 'Coinbase', 3_000)
  await db.write(
    q.insertInto('balance').values(held(manual.id, dust.id, '2026-09-20', '100000000000000')),
  )
  const { institutions, holdings } = await portfolio(db)
  const account = institutions
    .flatMap(({ accounts }) => accounts)
    .find(({ id }) => id === manual.id)
  expect(account?.positions).toMatchObject([{ id: dust.id, value: 0.0001 }])
  expect(holdings.find(({ id }) => id === dust.id)).toMatchObject({
    positions: [{ accountId: manual.id, kind: 'manual', value: 0.0001 }],
  })
})

test('an account fed by movements is valued at its closing: an overdraft subtracts, has no share, leaves the other shares alone and sorts above the unpriced', async () => {
  const db = await open()
  const bank = await createManualAccount(db, 'w3', 'Bank', 3_000)
  const euro = coin('fiat:EUR', 'EUR')
  await db.write(
    q.insertInto('asset').values(euro),
    q
      .insertInto('entry')
      .values([
        moved(bank.id, euro.id, '2026-09-20', '100000000000000000000'),
        moved(bank.id, euro.id, '2026-09-20', '-130000000000000000000'),
      ]),
    q.insertInto('price').values({ assetId: euro.id, day: '2026-09-20', usd: 1.25 }),
  )
  const { total, crypto, fiat, institutions, holdings } = await portfolio(db)
  expect(crypto).toBeCloseTo(5002.0011, 9)
  expect(fiat).toBe(-37.5)
  expect(holdings.map(({ symbol, share }) => [symbol, share])).toEqual([
    ['ETH', 5000 / 5002.0011],
    ['USDC', 2.001 / 5002.0011],
    ['EUR', null],
    ['OBS', null],
  ])
  expect(institutions.map(({ crypto, fiat }) => [crypto, fiat])).toEqual([
    [5001.5, 0],
    [0.5011, 0],
    [0, -37.5],
  ])
  expect(institutions.at(-1)?.accounts).toMatchObject([
    {
      name: 'Bank',
      value: -37.5,
      crypto: 0,
      fiat: -37.5,
      cash: true,
      coins: false,
      positions: [{ id: euro.id, quantity: -30_000_000_000_000_000_000n, amount: -30 }],
    },
  ])
  expect(total).toBeCloseTo(5002.0011 - 37.5, 9)
})

test('an account that holds a currency is cash, at a zero closing or with no price too', async () => {
  const db = await open()
  const bank = await createManualAccount(db, 'w3', 'Bank', 3_000)
  const savings = await createManualAccount(db, 'w3', 'Savings', 4_000)
  await createManualAccount(db, 'w3', 'Empty', 5_000)
  const broker = await createManualAccount(db, 'w3', 'Broker', 6_000)
  const euro = coin('fiat:EUR', 'EUR')
  const franc = coin('fiat:CHF', 'CHF')
  await db.write(
    q.insertInto('asset').values([euro, franc]),
    q
      .insertInto('entry')
      .values([
        moved(bank.id, euro.id, '2026-09-20', '50000000000000000000'),
        moved(bank.id, euro.id, '2026-09-20', '-50000000000000000000'),
        moved(savings.id, franc.id, '2026-09-20', '7000000000000000000'),
        moved(broker.id, euro.id, '2026-09-20', '5000000000000000000'),
      ]),
    q.insertInto('balance').values(held(broker.id, baseEth.id, '2026-09-20', '0')),
    q.insertInto('price').values({ assetId: euro.id, day: '2026-09-20', usd: 1.25 }),
  )
  const { fiat, institutions } = await portfolio(db)
  expect(fiat).toBe(6.25)
  expect(
    institutions.map(({ accounts }) =>
      accounts.map(({ name, cash, coins }) => [name, cash, coins]),
    ),
  ).toEqual([
    [['ledger', false, true]],
    [['hot', false, true]],
    [
      ['Bank', true, false],
      ['Savings', true, false],
      ['Empty', false, false],
      ['Broker', true, true],
    ],
  ])
})

test('an institution scope narrows the total, the holdings and the institutions', async () => {
  const { total, institutions, holdings } = await portfolio(await open(), 'w2')
  expect(total).toBe(0.5011)
  expect(institutions).toMatchObject([{ name: 'trading', accounts: [{ name: 'hot' }] }])
  expect(holdings.map(({ symbol, amount }) => [symbol, amount])).toEqual([
    ['USDC', 0.501],
    ['OBS', 7],
  ])
})

test('an empty database has an empty portfolio', async () => {
  expect(await portfolio(await migrated())).toEqual({
    total: 0,
    crypto: 0,
    fiat: 0,
    institutions: [],
    holdings: [],
  })
})

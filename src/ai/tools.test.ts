import { expect, test } from 'bun:test'
import { coin, held, migrated, moved } from '../../host/fresh'
import { createEvmAccount, createInstitution, createManualAccount } from '../data/accounts'
import { clearAi, pending, setRule } from '../data/categories'
import type { Fetch } from '../data/host'
import { applyImport, plan, read } from '../data/imports'
import { movements } from '../data/ledger'
import { portfolio } from '../data/portfolio'
import { type Day, q } from '../data/schema'
import { call, tools } from './tools'

const address = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const eth = coin('coingecko:ethereum', 'ETH', 'Ethereum')
const baseEth = { ...eth, id: 'eip155:8453/native' as const }
const fetch: Fetch = async (provider) => {
  if (provider === 'frankfurter') return { date: '2026-09-18', rates: { USD: 1.25 } }
  throw new Error('offline')
}

async function open() {
  const db = await migrated()
  const institution = await createInstitution(db, 'Escrow', 1)
  const account = await createEvmAccount(db, institution.id, address, 'Savings', 2)
  await db.write(
    q.insertInto('asset').values([eth, baseEth]),
    q
      .insertInto('balance')
      .values(held(account.id, baseEth.id, '2026-09-20', '2000000000000000000')),
    q.insertInto('price').values({ assetId: eth.id, day: '2026-09-20', usd: 2500 }),
  )
  const ctx = { db, fetch }
  return { db, ctx, institutionId: institution.id, accountId: account.id }
}

test('a tool error is masked like a result', async () => {
  const { db } = await open()
  const rejecting: Fetch = async () => {
    throw new Error(`rpc rejected ${address}`)
  }
  await expect(
    call({ db, fetch: rejecting }, 'update_settings', { currency: 'EUR' }),
  ).rejects.toThrow('rpc rejected addr_1')
})

test('every tool has a name, a description and object schemas', () => {
  expect(tools.map(({ name }) => name)).toEqual([
    'portfolio',
    'asset',
    'history',
    'settings',
    'add_institution',
    'add_account',
    'rename_institution',
    'rename_account',
    'remove_institution',
    'remove_account',
    'update_settings',
    'sync',
    'categorize',
  ])
  for (const tool of tools) expect(tool.description).toMatch(/\.$/)
})

test('reads are masked: no address leaves, chains are names, assets are canonical', async () => {
  const { ctx, institutionId, accountId } = await open()
  const result = await call(ctx, 'portfolio', {})
  expect(result).toEqual({
    display: { currency: 'USD', rate: 1 },
    total: 5000,
    institutions: [
      {
        id: institutionId,
        name: 'Escrow',
        value: 5000,
        accounts: [{ id: accountId, name: 'Savings', address: 'addr_1', value: 5000 }],
      },
    ],
    holdings: [
      {
        id: eth.id,
        symbol: 'ETH',
        name: 'Ethereum',
        amount: 2,
        price: 2500,
        value: 5000,
        share: 1,
      },
    ],
  })
  expect(JSON.stringify(result)).not.toContain('0x')
  expect(await call(ctx, 'asset', { assetId: eth.id })).toMatchObject({
    positions: [
      { account: 'Savings', institution: 'Escrow', chain: 'Base', amount: 2, value: 5000 },
    ],
  })
  expect(JSON.stringify(await call(ctx, 'portfolio', { institutionId }))).not.toContain('0x')
  await expect(call(ctx, 'portfolio', { institutionId: 'w9' })).rejects.toThrow(
    'Unknown institution.',
  )
})

test('writes take placeholders and validate their input', async () => {
  const { ctx, db, institutionId } = await open()
  await call(ctx, 'portfolio', {})
  await expect(call(ctx, 'add_account', { institutionId, address: 'addr_1' })).rejects.toThrow(
    'This account is already added.',
  )
  await expect(call(ctx, 'add_account', { institutionId, address: 'nope' })).rejects.toThrow(
    'Enter a valid EVM address.',
  )
  await expect(call(ctx, 'add_account', { institutionId: 'w9', address })).rejects.toThrow(
    'Unknown institution.',
  )
  const added = await call(ctx, 'add_account', {
    institutionId,
    address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
  })
  expect(added).toMatchObject({ name: 'addr_2', address: 'addr_2' })
  expect(await db.read(q.selectFrom('account').select('address').orderBy('address'))).toEqual([
    { address: '0x71c7656ec7ab88b098defb751b7401b5f6d8976f' },
    { address },
  ])
  expect(await call(ctx, 'rename_institution', { institutionId, name: ' Cold ' })).toEqual({
    id: institutionId,
    name: 'Cold',
  })
  expect(await call(ctx, 'add_institution', { name: 'Vault' })).toMatchObject({ name: 'Vault' })
  await expect(call(ctx, 'remove_account', { accountId: 'missing' })).rejects.toThrow(
    'Unknown account.',
  )
})

test('settings round-trip, an institution can be removed, sync with nothing to sync reports null', async () => {
  const { ctx, institutionId } = await open()
  expect(await call(ctx, 'update_settings', { currency: 'EUR' })).toEqual({
    currency: 'EUR',
    privacy: false,
  })
  expect(await call(ctx, 'settings', {})).toEqual({ currency: 'EUR', privacy: false })
  expect(await call(ctx, 'remove_institution', { institutionId })).toEqual({ ok: true })
  expect(await call(ctx, 'sync', {})).toEqual({ syncedAt: null })
  await expect(call(ctx, 'nothing', {})).rejects.toThrow('Unknown tool nothing.')
})

test('no read tool returns bank text: a memo, a file name or a label routed to an existing account', async () => {
  const { db, ctx, institutionId } = await open()
  const everyday = await createManualAccount(db, institutionId, 'Everyday')
  const text = [
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    'Card Payment,Quokkavault,2026-09-20 09:00:00,2026-09-20 09:00:00,Zanzibar Okonkwo,-4.50,0.00,EUR,COMPLETED,995.50',
  ].join('\n')
  const { draft, route } = await read(
    db,
    [{ name: 'marmalade.csv', text }],
    institutionId,
    everyday.id,
  )
  await applyImport(db, plan(draft, route))
  const { holdings } = await portfolio(db)
  expect(
    tools.filter(({ annotations }) => annotations.readOnlyHint).map(({ name }) => name),
  ).toEqual(['portfolio', 'asset', 'history', 'settings'])
  const results = [
    await call(ctx, 'portfolio', {}),
    await call(ctx, 'portfolio', { institutionId }),
    ...(await Promise.all(holdings.map(({ id }) => call(ctx, 'asset', { assetId: id })))),
    await call(ctx, 'history', {}),
    await call(ctx, 'history', { institutionId }),
    await call(ctx, 'settings', {}),
  ]
  const json = JSON.stringify(results)
  expect(json).toContain('fiat:EUR')
  for (const word of ['Zanzibar', 'marmalade', 'Quokkavault']) expect(json).not.toContain(word)
})

test('categorize hands out open parties, saves the first answer of each and stops when done', async () => {
  const { db, ctx, institutionId } = await open()
  const current = await createManualAccount(db, institutionId, 'Current')
  const savings = await createManualAccount(db, institutionId, 'Savings')
  const entry = (accountId: string, day: Day, quantity: string, memo: string) =>
    moved(accountId, 'fiat:EUR', day, quantity, memo)
  await db.write(
    q.insertInto('asset').values(coin('fiat:EUR', 'EUR')),
    q.insertInto('entry').values([
      entry(current.id, '2026-09-01', '-12400000000000000000', 'PINGO DOCE 1234'),
      entry(current.id, '2026-09-03', '-8000000000000000000', 'Pingo Doce'),
      entry(current.id, '2026-09-02', '-50000000000000000000', 'To Savings'),
      entry(savings.id, '2026-09-02', '50000000000000000000', 'From Current'),
      entry(current.id, '2026-09-04', '2000000000000000000000', 'ACME payroll'),
      entry(current.id, '2026-09-05', '-1000000000000000000', '123456'),
      {
        ...entry(current.id, '2026-09-06', '-90000000000000000000', 'Exchanged to USD'),
        kind: 'trade' as const,
      },
    ]),
  )
  const named = async (name: string) =>
    (await db.read(q.selectFrom('category').select('id').where('name', '=', name)))[0]?.id ?? ''
  await setRule(db, 'acme payroll', await named('Salary'))
  expect(pending(await movements(db, { all: true })).movements).toBe(5)

  const first = await call(ctx, 'categorize', {})
  expect(first).toMatchObject({
    saved: 0,
    skipped: [],
    merchants: [],
    examples: [{ party: 'acme payroll', category: 'Salary' }],
    accounts: expect.arrayContaining(['Current', 'Savings']),
    left: 0,
    next: 'Answer 4 parties, then call categorize with your answers.',
  })
  expect(first).toHaveProperty('categories.length', 25)
  expect(first).toHaveProperty('kinds', expect.arrayContaining(['supermarket', 'employer']))
  expect(first).toHaveProperty('parties', [
    {
      party: 'pingo doce',
      missing: ['category', 'merchant'],
      category: null,
      merchant: null,
      movements: 2,
      received: 0,
      mirrored: 0,
      first: '2026-09-01',
      last: '2026-09-03',
      samples: [
        { memo: 'Pingo Doce', amount: '-8 EUR', day: '2026-09-03', account: 'Current' },
        { memo: 'PINGO DOCE 1234', amount: '-12.4 EUR', day: '2026-09-01', account: 'Current' },
      ],
    },
    expect.objectContaining({ party: 'acme payroll', missing: ['merchant'], category: 'Salary' }),
    expect.objectContaining({ party: 'from current', received: 1, mirrored: 1 }),
    expect.objectContaining({ party: 'to savings', received: 0, mirrored: 1 }),
  ])

  const answers = [
    {
      party: 'PINGO DOCE',
      category: 'groceries',
      merchant: { name: 'Pingo Doce', kind: 'supermarket' },
    },
    { party: 'to savings', category: 'Transfers', merchant: null },
    { party: 'pingo doce', category: 'Eating out' },
    { party: 'nowhere', category: 'Groceries' },
    { party: 'from current', category: 'Fun', merchant: { name: 'Revolut', kind: 'spaceship' } },
    { party: 'acme payroll', category: 'Salary', merchant: { name: 'ACME', kind: 'employer' } },
  ]
  expect(await call(ctx, 'categorize', { answers })).toMatchObject({
    saved: 3,
    skipped: [
      { party: 'pingo doce', field: 'category', reason: 'answered' },
      { party: 'nowhere', field: 'category', reason: 'unknown' },
      { party: 'from current', field: 'category', reason: 'category' },
      { party: 'from current', field: 'merchant', reason: 'merchant' },
      { party: 'acme payroll', field: 'category', reason: 'answered' },
    ],
    merchants: [
      { name: 'Pingo Doce', kind: 'supermarket' },
      { name: 'ACME', kind: 'employer' },
    ],
    parties: [
      expect.objectContaining({ party: 'from current', missing: ['category', 'merchant'] }),
    ],
  })
  expect(
    await call(ctx, 'categorize', {
      answers: [
        { party: 'from current', category: null, merchant: { name: 'PINGO  DOCE', kind: 'bar' } },
      ],
    }),
  ).toMatchObject({
    saved: 1,
    parties: [],
    next: 'Done: the AI categorized 2 parties, was unsure of 1, and named the business behind 3. Tell the user to review them in Garner, Categories.',
  })
  expect(await call(ctx, 'categorize', { answers })).toMatchObject({ saved: 0, parties: [] })
  expect(
    await call(ctx, 'categorize', {
      answers: [
        { party: 'nowhere', category: null },
        { party: '999 123', category: 'Groceries' },
      ],
    }),
  ).toMatchObject({
    next: 'Nothing was saved: Garner knows none of these parties. Stop and tell the user.',
  })
  expect(pending(await movements(db, { all: true })).movements).toBe(0)
  expect(await db.read(q.selectFrom('merchant').select('name').orderBy('name'))).toEqual([
    { name: 'ACME' },
    { name: 'Pingo Doce' },
  ])
  expect(
    await db.read(
      q
        .selectFrom('identity')
        .innerJoin('merchant', 'merchant.id', 'identity.merchantId')
        .select(['identity.party', 'merchant.name'])
        .orderBy('identity.party'),
    ),
  ).toEqual([
    { party: 'acme payroll', name: 'ACME' },
    { party: 'from current', name: 'Pingo Doce' },
    { party: 'pingo doce', name: 'Pingo Doce' },
  ])

  await clearAi(db)
  expect(await db.read(q.selectFrom('rule').select('source'))).toEqual([{ source: 'user' }])
  expect(await db.read(q.selectFrom('identity').selectAll())).toEqual([])
  expect(await db.read(q.selectFrom('merchant').select('id'))).toEqual([])
  await db.write(q.deleteFrom('category'))
  await expect(call(ctx, 'categorize', {})).rejects.toThrow('There are no categories.')
})

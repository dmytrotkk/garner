import { expect, test } from 'bun:test'
import { account, coin, institution, migrated, moved } from '../../host/fresh'
import { categories, categorize, clearAi, overview, pending, setRule } from './categories'
import { movements } from './ledger'
import { createMerchant, editMerchant, identify, removeMerchant } from './merchants'
import { q } from './schema'

async function seeded() {
  const db = await migrated()
  await db.write(
    q.insertInto('institution').values(institution('i')),
    q.insertInto('account').values(account('a', 'i')),
    q.insertInto('asset').values(coin('fiat:EUR', 'EUR')),
    q
      .insertInto('entry')
      .values([
        moved('a', 'fiat:EUR', '2026-01-05', '-5', 'CONTINENTE LISBOA'),
        moved('a', 'fiat:EUR', '2026-01-06', '-7', 'Continente Online'),
        moved('a', 'fiat:EUR', '2026-01-07', '-9', 'To Maria'),
      ]),
  )
  const identities = async () =>
    (await movements(db, { accountId: 'a' })).map((row) =>
      row.kind === 'trade' ? null : [row.party, row.identity],
    )
  return { db, identities }
}

test('merchants are created, edited and removed with checked input, names unique without case', async () => {
  const { db } = await seeded()
  const input = { name: ' Continente ', kind: 'supermarket' }
  for (const [bad, message] of [
    [{ name: ' ' }, 'Enter a name.'],
    [{ name: '2024' }, 'Enter a name.'],
    [{ kind: 'spaceship' }, 'Choose a kind.'],
  ] as const)
    await expect(createMerchant(db, { ...input, ...bad }, 5)).rejects.toThrow(message)
  const continente = await createMerchant(db, input, 5)
  expect(continente).toMatchObject({ name: 'Continente', kind: 'supermarket', updatedAt: 5 })
  for (const name of ['CONTINENTE', 'Continenté', 'Continente.'])
    await expect(createMerchant(db, { name, kind: 'shop' })).rejects.toThrow(
      'A merchant with this name exists.',
    )
  await expect(editMerchant(db, 'nothing', input)).rejects.toThrow('Unknown merchant.')
  await editMerchant(db, continente.id, { name: 'Continente Modelo', kind: 'shop' }, 9)
  expect(await db.read(q.selectFrom('merchant').select(['name', 'kind', 'updatedAt']))).toEqual([
    { name: 'Continente Modelo', kind: 'shop', updatedAt: 9 },
  ])
  await removeMerchant(db, continente.id)
  expect(await db.read(q.selectFrom('merchant').select('id'))).toEqual([])
})

test('identify links a party to a merchant or to none as the user, and removing the merchant reopens its parties', async () => {
  const { db, identities } = await seeded()
  const continente = await createMerchant(db, { name: 'Continente', kind: 'supermarket' })
  await expect(identify(db, 'Continente Lisboa', continente.id)).rejects.toThrow('Unknown party.')
  await expect(identify(db, 'continente lisboa', 'nothing')).rejects.toThrow('Unknown merchant.')
  await identify(db, 'continente lisboa', continente.id)
  await identify(db, 'continente online', continente.id)
  await identify(db, 'to maria', null)
  const linked = { state: 'linked', merchantId: continente.id, source: 'user' } as const
  expect(await identities()).toEqual([
    ['to maria', { state: 'none', source: 'user' }],
    ['continente online', linked],
    ['continente lisboa', linked],
  ])
  expect((await overview(db)).merchants).toEqual([
    {
      id: continente.id,
      name: 'Continente',
      kind: 'supermarket',
      parties: 2,
      movements: 2,
      categoryId: null,
      by: 'user',
    },
  ])
  const groceries = (await categories(db)).find(({ name }) => name === 'Groceries')?.id ?? ''
  expect((await movements(db, { merchantId: continente.id })).map(({ memo }) => memo)).toEqual([
    'Continente Online',
    'CONTINENTE LISBOA',
  ])
  await setRule(db, 'continente lisboa', groceries)
  expect((await overview(db)).merchants[0]?.categoryId).toBe(groceries)
  expect((await movements(db, { categoryId: groceries })).map(({ memo }) => memo)).toEqual([
    'CONTINENTE LISBOA',
  ])
  await removeMerchant(db, continente.id)
  expect((await identities()).map((row) => row?.[1])).toEqual([
    { state: 'none', source: 'user' },
    { state: 'open' },
    { state: 'open' },
  ])
})

test('the checks keep identities canonical, Parties and By follow the identity rows, and Remove AI answers drops AI links and the merchants only they used', async () => {
  const { db, identities } = await seeded()
  const continente = await createMerchant(db, { name: 'Continente', kind: 'supermarket' })
  for (const party of ['', 'Continente', ' continente', 'continente  online'])
    await expect(
      db.write(q.insertInto('identity').values({ party, merchantId: null, source: 'ai' })),
    ).rejects.toThrow()
  await expect(
    db.write(
      q
        .insertInto('identity')
        .values({ party: 'to maria', merchantId: null, source: 'bot' as 'ai' }),
    ),
  ).rejects.toThrow()
  const lidl = await createMerchant(db, { name: 'Lidl', kind: 'supermarket' })
  await db.write(
    q.insertInto('identity').values([
      { party: 'continente lisboa', merchantId: continente.id, source: 'ai' },
      { party: 'to maria', merchantId: null, source: 'ai' },
      { party: 'nobody', merchantId: lidl.id, source: 'ai' },
    ]),
  )
  await identify(db, 'continente online', continente.id)
  await identify(db, 'continente lisboa', null)
  expect((await overview(db)).merchants).toMatchObject([
    { name: 'Continente', parties: 1, movements: 1, by: 'user' },
    { name: 'Lidl', parties: 1, movements: 0, by: 'ai' },
  ])
  await clearAi(db)
  expect((await identities()).map((row) => row?.[1])).toEqual([
    { state: 'open' },
    { state: 'linked', merchantId: continente.id, source: 'user' },
    { state: 'none', source: 'user' },
  ])
  expect(await db.read(q.selectFrom('merchant').select('name'))).toEqual([{ name: 'Continente' }])
})

test('categorize mints one merchant for names that fold alike, skips an empty name and a user identity, and saves a party field by field', async () => {
  const { db, identities } = await seeded()
  await createMerchant(db, { name: 'Continente', kind: 'supermarket' })
  await identify(db, 'to maria', null)
  const result = await categorize(db, [
    { party: 'continente online', merchant: { name: '***', kind: 'shop' } },
    { party: 'continente lisboa', merchant: { name: 'Pingo Doce', kind: 'supermarket' } },
    { party: 'continente online', merchant: { name: 'PINGO  DOCE', kind: 'bar' } },
    { party: 'to maria', merchant: { name: 'Maria', kind: 'services' } },
    { party: 'continente lisboa', category: 'Groceries' },
  ])
  expect(result).toMatchObject({
    saved: 2,
    skipped: [
      { party: 'continente online', field: 'merchant', reason: 'merchant' },
      { party: 'to maria', field: 'merchant', reason: 'answered' },
    ],
    merchants: [{ name: 'Pingo Doce', kind: 'supermarket' }],
  })
  const [pingo] = await db.read(
    q.selectFrom('merchant').select('id').where('name', '=', 'Pingo Doce'),
  )
  const linked = { state: 'linked', merchantId: pingo?.id ?? '', source: 'ai' } as const
  expect(await identities()).toEqual([
    ['to maria', { state: 'none', source: 'user' }],
    ['continente online', linked],
    ['continente lisboa', linked],
  ])
  expect(pending(await movements(db, { all: true })).movements).toBe(2)
  expect(await categorize(db, [{ party: 'to maria' }])).toMatchObject({
    saved: 0,
    skipped: [],
    next: 'Answer 2 parties, then call categorize with your answers.',
  })
})

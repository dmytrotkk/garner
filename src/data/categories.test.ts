import { expect, test } from 'bun:test'
import { account, coin, fresh, institution, migrated } from '../../host/fresh.ts'
import {
  categories,
  choose,
  createCategory,
  editCategory,
  forget,
  overview,
  pending,
  removeCategory,
  setNote,
  setRule,
} from './categories.ts'
import { createDb } from './db.ts'
import { assign, movements, partyOf } from './ledger.ts'
import { type Kind, migrations, q } from './schema.ts'

const euro = 'fiat:EUR' as const

async function seeded() {
  const db = await migrated()
  const entry = (accountId: string, ref: string, memo: string, kind: Kind = 'transfer') => ({
    accountId,
    ref,
    leg: kind === 'trade' ? 'trade' : 'amount',
    time: Date.UTC(2026, 0, 1) + ref.length,
    kind,
    assetId: euro,
    quantity: '-5',
    memo,
  })
  await db.write(
    q.insertInto('institution').values(institution('i')),
    q.insertInto('account').values(['a', 'b'].map((id) => account(id, 'i'))),
    q.insertInto('asset').values(coin(euro, 'EUR')),
    q
      .insertInto('entry')
      .values([
        entry('a', 'r1', 'PINGO DOCE 1234'),
        entry('a', 'r22', 'Pingo  Doce'),
        entry('b', 'r333', 'PINGO DOCE 5678'),
        entry('a', 'r4444', 'Exchanged to USD', 'trade'),
        entry('a', 'r4444', 'Exchanged to USD', 'fee'),
      ]),
  )
  const kinds = await categories(db)
  const id = (name: string) => kinds.find((category) => category.name === name)?.id ?? ''
  return { db, groceries: id('Groceries'), eating: id('Eating out') }
}

test('a party is the memo in plain words, without the words that hold two or more digits', () => {
  expect(partyOf('PINGO DOCE LISBOA')).toBe('pingo doce lisboa')
  expect(partyOf('Café  Ñandú\tPorto')).toBe('cafe nandu porto')
  expect(partyOf('MB WAY 912345678')).toBe('mb way')
  expect(partyOf('PayPal *Steam')).toBe('paypal steam')
  expect(partyOf('TRF 2026-01-05 REF 123456')).toBe('trf ref')
  expect(partyOf('O2 UK')).toBe('o2 uk')
  expect(partyOf('1Password')).toBe('1password')
  expect(partyOf('ﬁnance')).toBe('finance')
  expect(partyOf('123456')).toBe('')
  expect(partyOf(null)).toBe('')
})

test('a choice beats the rule of its party, an AI rule without a category is unsure', () => {
  const rules = new Map([
    ['shop', { categoryId: 'c1', source: 'user' as const }],
    ['bot', { categoryId: 'c2', source: 'ai' as const }],
    ['maybe', { categoryId: null, source: 'ai' as const }],
  ])
  expect(assign('shop', 'c9', rules)).toEqual({ state: 'chosen', categoryId: 'c9' })
  expect(assign('shop', undefined, rules)).toEqual({
    state: 'ruled',
    party: 'shop',
    categoryId: 'c1',
    source: 'user',
  })
  expect(assign('bot', undefined, rules)).toMatchObject({ state: 'ruled', source: 'ai' })
  expect(assign('maybe', undefined, rules)).toEqual({ state: 'unsure', party: 'maybe' })
  expect(assign('', undefined, rules)).toEqual({ state: 'open', party: '' })
})

test('migrations 10 to 12 seed twenty five categories and the checks keep rules canonical', async () => {
  const { db, groceries } = await seeded()
  const kinds = await categories(db)
  expect(kinds).toHaveLength(25)
  expect(
    Map.groupBy(kinds, ({ type }) => type)
      .get('income')
      ?.map(({ name }) => name),
  ).toEqual(['Freelance', 'Interest', 'Other income', 'Rental income', 'Salary'])
  for (const party of ['', 'Bolt', ' bolt', 'bolt  food'])
    await expect(
      db.write(q.insertInto('rule').values({ party, categoryId: groceries, source: 'ai' })),
    ).rejects.toThrow()
  await expect(
    db.write(q.insertInto('rule').values({ party: 'bolt', categoryId: null, source: 'user' })),
  ).rejects.toThrow()
  await db.write(q.insertInto('rule').values({ party: 'bolt', categoryId: null, source: 'ai' }))
})

test('migration 11 keeps a hint the user edited and a category the user already named', async () => {
  const db = createDb(fresh())
  await db.migrate(migrations.slice(0, 11))
  const salary = '01a1095c-3411-751f-919f-4aac9ff70133'
  await db.write(
    q.updateTable('category').set({ hint: 'My job' }).where('id', '=', salary),
    q.insertInto('category').values({
      id: 'mine',
      name: 'interest',
      icon: 'bank',
      type: 'income',
      hint: '',
      updatedAt: 1,
    }),
  )
  await db.migrate(migrations)
  const kinds = await categories(db)
  const hint = (name: string) => kinds.find((category) => category.name === name)?.hint
  expect(kinds).toHaveLength(25)
  expect(hint('Salary')).toBe('My job')
  expect(hint('Transport')).toBe('Public transport, taxis, ride hailing')
  expect(hint('Other income')).toBe(
    'Gifts, cashback, prizes, sales of my own things, anything else received',
  )
  expect(kinds.find(({ name }) => name.toLowerCase() === 'interest')?.id).toBe('mine')
  expect(kinds.find(({ name }) => name === 'Loans')?.type).toBe('transfer')
})

test('choose, setRule and setNote write user state that the movements read', async () => {
  const { db, groceries, eating } = await seeded()
  const a1 = { accountId: 'a', ref: 'r1' }
  await expect(choose(db, { accountId: 'a', ref: 'none' }, groceries)).rejects.toThrow(
    'Unknown movement.',
  )
  await expect(choose(db, { accountId: 'a', ref: 'r4444' }, groceries)).rejects.toThrow(
    'A swap has no category.',
  )
  await expect(choose(db, a1, 'nothing')).rejects.toThrow('Unknown category.')
  await expect(choose(db, a1, '')).rejects.toThrow('Choose a category.')
  await expect(setRule(db, 'Pingo Doce', groceries)).rejects.toThrow('Unknown party.')

  await db.write(
    q.insertInto('rule').values({ party: 'pingo doce', categoryId: eating, source: 'ai' }),
  )
  await choose(db, a1, eating)
  await choose(db, { accountId: 'b', ref: 'r333' }, eating)
  expect(pending(await movements(db, { all: true })).alike.get('pingo doce')).toBe(1)
  await setRule(db, 'pingo doce', groceries, a1)
  await setNote(db, a1, '  weekly shop ')

  const rows = await movements(db, { accountId: 'a' })
  const ruled = {
    state: 'ruled',
    party: 'pingo doce',
    categoryId: groceries,
    source: 'user',
  } as const
  expect(
    rows.map((row) => [row.ref, row.note, row.kind === 'trade' ? row.kind : row.assignment]),
  ).toEqual([
    ['r4444', null, 'trade'],
    ['r22', null, ruled],
    ['r1', 'weekly shop', ruled],
  ])
  expect((await movements(db, { accountId: 'b' }))[0]).toMatchObject({
    assignment: { state: 'chosen', categoryId: eating },
  })

  await setNote(db, a1, ' ')
  expect(await db.read(q.selectFrom('note').selectAll())).toEqual([])
  await db.write(q.deleteFrom('category').where('id', '=', eating))
  expect(await db.read(q.selectFrom('choice').selectAll())).toEqual([])
  await db.write(q.deleteFrom('category').where('id', '=', groceries))
  expect(await db.read(q.selectFrom('rule').selectAll())).toEqual([])
})

test('categories are created, edited and removed with checked input, and forget drops a rule', async () => {
  const { db, groceries } = await seeded()
  const input = { name: ' Pets ', icon: 'pet', type: 'expense', hint: ' Food, vet ' }
  for (const [bad, message] of [
    [{ name: ' ' }, 'Enter a name.'],
    [{ icon: 'dog' }, 'Choose an icon.'],
    [{ type: 'spent' }, 'Choose a type.'],
    [{ name: 'groceries' }, 'A category with this name exists.'],
  ] as const)
    await expect(createCategory(db, { ...input, ...bad }, 5)).rejects.toThrow(message)
  const pets = await createCategory(db, input, 5)
  expect(pets).toMatchObject({ name: 'Pets', icon: 'pet', type: 'expense', hint: 'Food, vet' })

  await expect(editCategory(db, 'nothing', input)).rejects.toThrow('Unknown category.')
  await expect(editCategory(db, pets.id, { ...input, name: 'Groceries' })).rejects.toThrow(
    'A category with this name exists.',
  )
  await editCategory(db, pets.id, { ...input, name: 'PETS', type: 'income' }, 9)
  expect((await categories(db)).find(({ id }) => id === pets.id)).toMatchObject({
    name: 'PETS',
    type: 'income',
  })

  await setRule(db, 'pingo doce', pets.id)
  await choose(db, { accountId: 'b', ref: 'r333' }, groceries)
  const { categories: kinds, rules } = await overview(db)
  expect(kinds.find(({ id }) => id === pets.id)).toMatchObject({ movements: 2, rules: 1 })
  expect(kinds.find(({ id }) => id === groceries)).toMatchObject({ movements: 1, rules: 0 })
  expect(rules).toEqual([
    { party: 'pingo doce', categoryId: pets.id, source: 'user', movements: 2 },
  ])

  await expect(forget(db, 'nothing')).rejects.toThrow('Unknown rule.')
  await removeCategory(db, pets.id)
  expect((await overview(db)).rules).toEqual([])
  await setRule(db, 'pingo doce', groceries)
  await forget(db, 'pingo doce')
  expect(await db.read(q.selectFrom('rule').selectAll())).toEqual([])
})

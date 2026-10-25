import { expect, test } from 'bun:test'
import { parseUnits } from 'viem'
import { account, coin, institution, migrated, moved } from '../../host/fresh'
import { categories, setRule } from './categories'
import { movements } from './ledger'
import { type Day, q } from './schema'
import { setSetting } from './settings'
import { months } from './spending'

test('a month spends what left for expenses and open, nets refunds, skips transfers and converts each day', async () => {
  const db = await migrated()
  const entry = (accountId: string, day: Day, amount: string, memo: string) =>
    moved(
      accountId,
      accountId === 'b' ? 'fiat:USD' : 'fiat:EUR',
      day,
      parseUnits(amount, 18).toString(),
      memo,
    )
  await db.write(
    q.insertInto('institution').values(institution('i')),
    q.insertInto('account').values(['a', 'b'].map((id) => account(id, 'i'))),
    q.insertInto('asset').values([coin('fiat:EUR', 'EUR'), coin('fiat:USD', 'USD')]),
    q.insertInto('price').values([
      { assetId: 'fiat:EUR', day: '2026-01-01', usd: 1.25 },
      { assetId: 'fiat:USD', day: '2026-01-01', usd: 1 },
    ]),
    q
      .insertInto('entry')
      .values([
        entry('a', '2026-01-05', '-10', 'Shop'),
        entry('a', '2026-01-06', '3', 'Shop'),
        entry('a', '2026-01-06', '-50', 'To Savings'),
        entry('b', '2026-01-07', '-12.5', 'Diner'),
        entry('a', '2026-02-01', '100', 'Payroll'),
        { ...entry('a', '2026-02-02', '-40', 'Exchanged'), kind: 'trade' as const },
      ]),
    setSetting('currency', 'EUR'),
  )
  const id = async (name: string) =>
    (await categories(db)).find((category) => category.name === name)?.id ?? ''
  await setRule(db, 'shop', await id('Groceries'))
  await setRule(db, 'to savings', await id('Transfers'))
  await setRule(db, 'payroll', await id('Salary'))

  const groceries = await id('Groceries')
  expect(await months(db, await movements(db, { accountId: 'a' }))).toEqual({
    currency: 'EUR',
    totals: {
      '2026-01': { spent: 7, in: 3, out: 10, categories: { [groceries]: 7 } },
      '2026-02': { spent: 0, in: 100, out: 0, categories: {} },
    },
  })
  expect((await movements(db, { institutionId: 'i' })).length).toBe(6)
  expect(await movements(db, { institutionId: 'other' })).toEqual([])
  expect((await months(db, await movements(db, { cash: true }))).totals['2026-01']).toEqual({
    spent: 17,
    in: 3,
    out: 20,
    categories: { [groceries]: 7, '': 10 },
  })
})

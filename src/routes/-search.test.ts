import { expect, test } from 'bun:test'
import { parseUnits } from 'viem'
import { account, coin, institution, migrated, moved } from '../../host/fresh.ts'
import { categories, setNote, setRule } from '../data/categories.ts'
import { movements } from '../data/ledger.ts'
import { createMerchant, identify, merchants } from '../data/merchants.ts'
import { portfolio } from '../data/portfolio.ts'
import { parse } from '../data/query.ts'
import { type Day, q } from '../data/schema.ts'
import { setSetting } from '../data/settings.ts'
import { months, valuation } from '../data/spending.ts'
import { matching } from './-search.tsx'

async function data() {
  const db = await migrated()
  const entry = (accountId: string, day: Day, amount: string, memo: string) =>
    moved(accountId, 'fiat:EUR', day, parseUnits(amount, 18).toString(), memo)
  const paid = entry('current', '2026-03-02', '-12.5', 'COMPRA CAFÉ CENTRAL')
  await db.write(
    q.insertInto('institution').values(institution('bank', 'Northwind')),
    q.insertInto('account').values(['current', 'savings'].map((id) => account(id, 'bank'))),
    q.insertInto('asset').values(coin('fiat:EUR', 'EUR')),
    q
      .insertInto('entry')
      .values([
        entry('current', '2026-03-01', '-40', 'Shop'),
        paid,
        entry('current', '2026-03-03', '-100', 'To pocket'),
        entry('savings', '2026-03-03', '100', 'To pocket'),
        { ...entry('current', '2026-03-04', '-1', 'Card fee'), kind: 'fee' as const },
        entry('current', '2026-03-05', '20', 'Refund'),
      ]),
    setSetting('currency', 'EUR'),
  )
  const groceries = (await categories(db)).find(({ name }) => name === 'Groceries')?.id ?? ''
  await setRule(db, 'shop', groceries)
  await identify(
    db,
    'compra cafe central',
    (await createMerchant(db, { name: 'Central', kind: 'cafe' })).id,
  )
  await setNote(db, { accountId: paid.accountId, ref: paid.ref }, 'dinner with friends')
  const [overview, sorted, businesses, rows] = await Promise.all([
    portfolio(db),
    categories(db),
    merchants(db),
    movements(db, { all: true }),
  ])
  return {
    db,
    rows,
    context: await valuation(db, rows),
    institutions: overview.institutions,
    holdings: overview.holdings,
    merchants: businesses,
    byCategory: new Map(sorted.map((category) => [category.id, category])),
  }
}

const day: Day = '2026-10-20'
const memos = (found: ReturnType<typeof matching>) => found.rows.map(({ memo }) => memo)

test('a movement matches every word it carries, an internal one Transfers, never its amount, date or kind as a plain transfer', async () => {
  const all = await data()
  const find = (input: string) => memos(matching(all, parse(input, day)))
  expect(find('cafe')).toEqual(['COMPRA CAFÉ CENTRAL'])
  expect(find('dinner')).toEqual(['COMPRA CAFÉ CENTRAL'])
  expect(find('central')).toEqual(['COMPRA CAFÉ CENTRAL'])
  expect(find('groceries')).toEqual(['Shop'])
  expect(find('expenses')).toEqual(['Shop'])
  expect(find('fee')).toEqual(['Card fee'])
  expect(find('northwind')).toHaveLength(6)
  expect(find('savings')).toEqual(['To pocket', 'To pocket'])
  expect(find('eur')).toHaveLength(6)
  expect(find('transfer')).toEqual(['To pocket', 'To pocket'])
  expect(find('"12"')).toEqual([])
  expect(find('"2026"')).toEqual([])
  expect(find('12')).toEqual(['COMPRA CAFÉ CENTRAL'])
  expect(find('march 2026 over 30')).toEqual(['To pocket', 'To pocket', 'Shop'])
})

test('newest first, a narrower query keeps the survivors in order, and Net leaves out paired legs', async () => {
  const all = await data()
  const wide = matching(all, parse('c', day)).rows
  const narrow = matching(all, parse('ca', day)).rows
  expect(narrow).toEqual(wide.filter((row) => narrow.includes(row)))
  expect(wide.map(({ time }) => time)).toEqual(
    wide.map(({ time }) => time).toSorted((a, b) => b - a),
  )
  expect(matching(all, parse('', day)).total).toEqual({ label: 'Net', amount: -33.5 })
  expect(matching(all, parse('pocket', day)).total.amount).toBe(0)
})

test('a word that starts nothing reaches a movement by a typo, unless another index knows it', async () => {
  const all = await data()
  const found = matching(all, parse('centrl', day))
  expect([memos(found), found.typo]).toEqual([['COMPRA CAFÉ CENTRAL'], true])
  expect(matching(all, parse('centrl', day), () => true).rows).toEqual([])
})

test('Spent and Received total what the month headers count as Spent and In', async () => {
  const all = await data()
  const { totals } = await months(all.db, all.rows)
  const month = totals['2026-03']
  expect(matching(all, parse('spent', day)).total).toEqual({
    label: 'Spent',
    amount: month?.spent ?? 0,
  })
  expect(matching(all, parse('received', day)).total).toEqual({
    label: 'Received',
    amount: month?.in ?? 0,
  })
  expect(memos(matching(all, parse('received', day)))).toEqual(['Refund'])
})

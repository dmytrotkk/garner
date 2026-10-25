import { expect, test } from 'bun:test'
import { parseUnits } from 'viem'
import { account, coin, institution, migrated, moved } from '../../host/fresh'
import { cashflow, grainOf, latest, period, shift, trailing, within } from './cashflow'
import { categories, setRule } from './categories'
import { movements } from './ledger'
import { createMerchant, identify, merchantKinds } from './merchants'
import { type Day, q } from './schema'
import { setSetting } from './settings'
import { months, valuation } from './spending'
import { decide } from './transfers'

const entry = (accountId: string, day: Day, amount: string, memo: string, assetId = 'fiat:EUR') =>
  moved(accountId, assetId as 'fiat:EUR', day, parseUnits(amount, 18).toString(), memo)

const key = (row: ReturnType<typeof entry>) => ({
  accountId: row.accountId,
  ref: row.ref,
  leg: row.leg,
})

const owners = new Map([
  ['rev', 'i1'],
  ['pocket', 'i1'],
  ['act', 'i2'],
])

async function sketch() {
  const db = await migrated()
  const rows = {
    salary: entry('rev', '2026-10-02', '3200', 'Payroll'),
    kraken: entry('rev', '2026-10-03', '500', 'Kraken'),
    cinema: entry('rev', '2026-10-05', '-120', 'Cinema'),
    shop: entry('rev', '2026-10-06', '-400', 'Shop'),
    toAct: entry('rev', '2026-10-07', '-1500', 'To act'),
    fromRev: entry('act', '2026-10-08', '1500', 'From rev'),
    toPocket: entry('rev', '2026-10-09', '-300', 'Pocket'),
    inPocket: entry('pocket', '2026-10-09', '300', 'Pocket'),
    bills: entry('pocket', '2026-10-10', '-100', 'Bills'),
    actShop: entry('act', '2026-10-12', '-50', 'Shop'),
    september: entry('rev', '2026-09-15', '-10', 'Shop'),
  }
  await db.write(
    q.insertInto('institution').values([institution('i1'), institution('i2')]),
    q
      .insertInto('account')
      .values([account('rev', 'i1'), account('pocket', 'i1'), account('act', 'i2')]),
    q.insertInto('asset').values([coin('fiat:EUR', 'EUR'), coin('fiat:USD', 'USD')]),
    q.insertInto('entry').values(Object.values(rows)),
    setSetting('currency', 'EUR'),
  )
  const id = async (name: string) =>
    (await categories(db)).find((category) => category.name === name)?.id ?? ''
  const ids = {
    salary: await id('Salary'),
    transfers: await id('Transfers'),
    entertainment: await id('Entertainment'),
    groceries: await id('Groceries'),
  }
  await setRule(db, 'payroll', ids.salary)
  await setRule(db, 'kraken', ids.transfers)
  await setRule(db, 'cinema', ids.entertainment)
  await setRule(db, 'shop', ids.groceries)
  const merchant = await createMerchant(db, { name: 'Kraken', kind: merchantKinds[0] })
  await identify(db, 'kraken', merchant.id)
  await decide(db, key(rows.toAct), { state: 'paired', with: key(rows.fromRev) })
  await decide(db, key(rows.toPocket), { state: 'paired', with: key(rows.inPocket) })
  return { db, rows, ids, merchant }
}

const october = { from: '2026-10', to: '2026-10' } as const

const edge = (from: string, to: string, value: number) => ({ from, to, value })

const sorted = (edges: readonly ReturnType<typeof edge>[]) =>
  edges.toSorted((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))

test('the account view: sources left, sinks right, other own accounts as leaves, kept closes', async () => {
  const { db, ids, merchant } = await sketch()
  const rows = await movements(db, { all: true })
  const context = await valuation(db, rows)
  const flow = cashflow(rows, october, { kind: 'account', accountId: 'rev' }, owners, context)
  expect(flow.unpriced).toBe(0)
  expect(flow.edges).toEqual(
    sorted([
      edge(`in:category:${ids.salary}`, 'account:rev', 3200),
      edge(`in:merchant:${merchant.id}`, 'account:rev', 500),
      edge('account:rev', 'out:account:act', 1500),
      edge('account:rev', 'out:account:pocket', 300),
      edge('account:rev', `out:category:${ids.entertainment}`, 120),
      edge('account:rev', `out:category:${ids.groceries}`, 400),
      edge('account:rev', 'out:kept', 1380),
    ]),
  )
  expect(flow.nodes.map(({ id }) => id)).toEqual([
    'account:rev',
    `in:category:${ids.salary}`,
    `out:category:${ids.groceries}`,
    `out:category:${ids.entertainment}`,
    'out:account:act',
    `in:merchant:${merchant.id}`,
    'out:account:pocket',
    'out:kept',
  ])
  expect(flow.nodes.find(({ id }) => id === `in:merchant:${merchant.id}`)?.ref).toEqual({
    kind: 'merchant',
    merchantId: merchant.id,
    categoryId: ids.transfers,
  })
})

test('the home view folds accounts into institutions, skips moves inside one, keeps a saver as a sink', async () => {
  const { db, ids, rows: inserted } = await sketch()
  const rows = await movements(db, { all: true })
  const context = await valuation(db, rows)
  const all = cashflow(rows, october, { kind: 'all' }, owners, context)
  expect(all.edges).toContainEqual(edge('institution:i1', 'institution:i2', 1500))
  expect(all.edges).toContainEqual(edge('institution:i1', 'out:none', 100))
  expect(all.edges).toContainEqual(edge('institution:i2', `out:category:${ids.groceries}`, 50))
  expect(all.edges).toContainEqual(edge('institution:i1', 'out:kept', 1580))
  expect(all.edges).toContainEqual(edge('institution:i2', 'out:kept', 1450))
  expect(all.edges.some(({ to }) => to === 'out:account:pocket')).toBe(false)
  const spent = (await months(db, rows)).totals['2026-10']?.spent
  const sinks = all.edges
    .filter(({ to }) => to.startsWith('out:category:') || to === 'out:none')
    .reduce((sum, { value }) => sum + value, 0)
  expect(sinks).toBe(spent ?? -1)

  await db.write(q.deleteFrom('entry').where('ref', '=', inserted.actShop.ref))
  const saver = cashflow(
    await movements(db, { all: true }),
    october,
    { kind: 'all' },
    owners,
    context,
  )
  expect(saver.edges.filter(({ from }) => from === 'institution:i2')).toEqual([])
  expect(saver.edges).toContainEqual(edge('institution:i1', 'institution:i2', 1500))
})

test('the institution view and the range', async () => {
  const { db, ids } = await sketch()
  const rows = await movements(db, { all: true })
  const context = await valuation(db, rows)
  const i2 = cashflow(rows, october, { kind: 'institution', institutionId: 'i2' }, owners, context)
  expect(i2.edges).toEqual(
    sorted([
      edge('in:institution:i1', 'institution:i2', 1500),
      edge('institution:i2', `out:category:${ids.groceries}`, 50),
      edge('institution:i2', 'out:kept', 1450),
    ]),
  )
  const september = cashflow(
    rows,
    { from: '2026-09', to: '2026-09' },
    { kind: 'account', accountId: 'rev' },
    owners,
    context,
  )
  expect(september.edges).toEqual(
    sorted([
      edge('in:balance', 'account:rev', 10),
      edge('account:rev', `out:category:${ids.groceries}`, 10),
    ]),
  )
  expect(
    cashflow(rows, { from: '2026-08', to: '2026-08' }, { kind: 'all' }, owners, context),
  ).toEqual({
    nodes: [],
    edges: [],
    unpriced: 0,
  })
})

test('two-way transfers net, fees and shortfalls go to no category, unpriced rows are counted', async () => {
  const db = await migrated()
  const out = entry('a', '2026-03-02', '-101', 'Send')
  const fee = {
    ...out,
    leg: 'fee',
    kind: 'fee' as const,
    quantity: parseUnits('-1', 18).toString(),
  }
  const back = entry('a', '2026-03-05', '300', 'Back')
  const sent = entry('b', '2026-03-05', '-300', 'Back')
  const got = entry('b', '2026-03-03', '100', 'Got')
  const dollars = entry('a', '2026-03-09', '-7', 'Abroad', 'fiat:USD')
  await db.write(
    q.insertInto('institution').values([institution('x'), institution('y')]),
    q.insertInto('account').values([account('a', 'x'), account('b', 'y')]),
    q.insertInto('asset').values([coin('fiat:EUR', 'EUR'), coin('fiat:USD', 'USD')]),
    q.insertInto('entry').values([out, fee, back, sent, got, dollars]),
    setSetting('currency', 'EUR'),
  )
  await decide(db, key(out), { state: 'paired', with: key(got) })
  await decide(db, key(sent), { state: 'paired', with: key(back) })
  const rows = await movements(db, { all: true })
  const context = await valuation(db, rows)
  const pairs = new Map([
    ['a', 'x'],
    ['b', 'y'],
  ])
  const march = { from: '2026-03', to: '2026-03' } as const
  const all = cashflow(rows, march, { kind: 'all' }, pairs, context)
  expect(all.unpriced).toBe(1)
  expect(all.edges).toEqual(
    sorted([
      edge('institution:x', 'out:none', 2),
      edge('institution:y', 'institution:x', 200),
      edge('in:balance', 'institution:y', 200),
      edge('institution:x', 'out:kept', 198),
    ]),
  )
  const a = cashflow(rows, march, { kind: 'account', accountId: 'a' }, pairs, context)
  expect(a.edges).toEqual(
    sorted([
      edge('account:a', 'out:account:b', 100),
      edge('account:a', 'out:none', 2),
      edge('in:account:b', 'account:a', 300),
      edge('account:a', 'out:kept', 198),
    ]),
  )
})

test('refunds net per category, open rows do not, small categories fold into other', async () => {
  const db = await migrated()
  const names = [
    'Groceries',
    'Eating out',
    'Housing',
    'Utilities',
    'Transport',
    'Car',
    'Travel',
    'Shopping',
    'Health',
    'Personal care',
    'Entertainment',
    'Software',
  ]
  const rows = names.flatMap((name, index) => [
    entry('a', '2026-05-02', `-${(index + 1) * 10}`, name),
    ...(index === 0 ? [entry('a', '2026-05-03', '3', name)] : []),
  ])
  const open = [entry('a', '2026-05-04', '-5', 'Mystery'), entry('a', '2026-05-05', '8', 'Found')]
  await db.write(
    q.insertInto('institution').values(institution('x')),
    q.insertInto('account').values(account('a', 'x')),
    q.insertInto('asset').values(coin('fiat:EUR', 'EUR')),
    q.insertInto('entry').values([...rows, ...open]),
    setSetting('currency', 'EUR'),
  )
  const list = await categories(db)
  const id = (name: string) => list.find((category) => category.name === name)?.id ?? ''
  for (const name of names) await setRule(db, name.toLowerCase(), id(name))
  const moved = await movements(db, { all: true })
  const context = await valuation(db, moved)
  const may = { from: '2026-05', to: '2026-05' } as const
  const flow = cashflow(
    moved,
    may,
    { kind: 'account', accountId: 'a' },
    new Map([['a', 'x']]),
    context,
  )
  const other = flow.nodes.find(({ id }) => id === 'out:other')
  expect(other?.ref).toEqual({
    kind: 'other',
    folded: [
      { ref: { kind: 'category', categoryId: id('Eating out') }, value: 20 },
      { ref: { kind: 'category', categoryId: id('Groceries') }, value: 7 },
    ],
  })
  expect(flow.edges).toContainEqual(edge('account:a', 'out:other', 27))
  expect(flow.edges).toContainEqual(edge('account:a', 'out:none', 5))
  expect(flow.edges).toContainEqual(edge('in:none', 'account:a', 8))
  expect(flow.edges).toContainEqual(edge('in:balance', 'account:a', 774))
  const wide = cashflow(
    moved,
    may,
    { kind: 'account', accountId: 'a' },
    new Map([['a', 'x']]),
    context,
    11,
  )
  expect(wide.nodes.some(({ id }) => id === 'out:other')).toBe(false)
  expect(wide.edges).toContainEqual(edge('account:a', `out:category:${id('Groceries')}`, 7))
})

test('periods are calendar months, quarters and years, stepped by their length', () => {
  expect(period('month', '2026-03')).toEqual({ from: '2026-03', to: '2026-03' })
  expect(period('quarter', '2026-03')).toEqual({ from: '2026-01', to: '2026-03' })
  expect(period('quarter', '2026-10')).toEqual({ from: '2026-10', to: '2026-12' })
  expect(period('year', '2026-10')).toEqual({ from: '2026-01', to: '2026-12' })
  expect(trailing(3, '2026-10')).toEqual({ from: '2026-08', to: '2026-10' })
  expect(trailing(3, '2026-01')).toEqual({ from: '2025-11', to: '2026-01' })
  expect(shift({ from: '2026-08', to: '2026-10' }, 1)).toEqual({ from: '2026-11', to: '2027-01' })
  expect(shift({ from: '2026-01', to: '2026-12' }, -1)).toEqual({ from: '2025-01', to: '2025-12' })
  expect(grainOf({ from: '2026-10', to: '2026-12' })).toBe('quarter')
  expect(grainOf({ from: '2026-08', to: '2026-10' })).toBeUndefined()
  expect(grainOf({ from: '2026-01', to: '2026-12' })).toBe('year')
  expect(within({ from: '2026-10', to: '2026-12' }, Date.parse('2026-12-31T23:59:59Z'))).toBe(true)
  expect(within({ from: '2026-10', to: '2026-12' }, Date.parse('2027-01-01T00:00:00Z'))).toBe(false)
  expect(latest([])).toBeUndefined()
})

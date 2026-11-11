import { expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { book, coin, migrated } from '../../host/fresh.ts'
import { createEvmAccount, createInstitution, createManualAccount, remove } from './accounts.ts'
import { applyImport, imports, parsers, plan, type Route, read, removeImport } from './imports.ts'
import { ledger } from './ledger.ts'
import { type AssetId, dayOf, q } from './schema.ts'
import { open as decode, view } from './statement.ts'

const header =
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance'
const row = (
  product: string,
  stamp: string,
  memo: string,
  amount: string,
  balance: string,
  currency = 'EUR',
) =>
  `Card Payment,${product},${stamp},${stamp},${memo},${amount},0.00,${currency},COMPLETED,${balance}`
const doc = (name: string, rows: readonly string[]) => ({
  name,
  text: `${[header, ...rows].join('\n')}\n`,
})
const pending = 'Card Payment,Current,2026-01-07 09:00:00,,Pending shop,-20.00,0.00,EUR,PENDING,'
const january = doc('january.csv', [
  row('Current', '2026-01-05 09:00:00', 'Cafe', '-4.50', '995.50'),
  row('Current', '2026-01-06 10:00:00', 'To savings', '-100.00', '895.50'),
  row('Current', '2026-01-07 08:00:00', 'Metro', '-1.65', '893.85'),
  row('Savings', '2026-01-06 10:00:00', 'To savings', '100.00', '450.00'),
  pending,
])
const later = doc('later.csv', [
  row('Current', '2026-01-07 08:00:00', 'Metro Lisboa', '-1.65', '893.85'),
  row('Current', '2026-01-08 12:00:00', 'Salary', '2000.00', '2893.85'),
  row('Current', '2026-01-09 09:30:00', 'Rent', '-700.00', '2193.85'),
])
const cents = (value: number) => BigInt(Math.round(value * 100)) * 10n ** 16n
const noon = (day: number, hour = 12) => Date.UTC(2026, 0, day, hour)

async function open() {
  const db = await migrated()
  const load = async (docs: readonly (typeof january)[], institutionId?: string) => {
    const { draft, route } = await read(db, docs, institutionId)
    const planned = plan(draft, route)
    await applyImport(db, planned)
    return planned
  }
  const memos = async () =>
    (await db.read(q.selectFrom('entry').select('memo').orderBy('time').orderBy('ref'))).map(
      ({ memo }) => memo,
    )
  const balances = () =>
    db.read(
      q
        .selectFrom('balance')
        .innerJoin('account', 'account.id', 'balance.accountId')
        .select(['account.name', 'balance.day', 'balance.quantity'])
        .orderBy('account.name')
        .orderBy('balance.day'),
    )
  const account = async (name: string) =>
    (await db.read(q.selectFrom('account').select('id').where('name', '=', name)))[0]?.id ?? ''
  const typed = (
    accountId: string,
    time: number,
    amount: bigint,
    assetId: AssetId = 'fiat:EUR',
  ) => {
    const quantity = String(amount)
    return q
      .insertInto('balance')
      .values({ accountId, assetId, day: dayOf(time), time, quantity })
      .onConflict((oc) =>
        oc.columns(['accountId', 'assetId', 'day']).doUpdateSet({ time, quantity }),
      )
  }
  return { db, load, memos, balances, account, typed }
}

test('a first file makes an institution named after the bank, an account per product, memos, daily balances and the kept file', async () => {
  const { db, memos, balances } = await open()
  const { draft, route } = await read(db, [january])
  expect(draft.institution).toMatchObject({ name: 'Revolut', fresh: true })
  expect(draft.controls.map(({ label, fresh }) => [label, fresh.name])).toEqual([
    ['Current', 'Revolut Current'],
    ['Savings', 'Revolut Savings'],
  ])
  const planned = plan(draft, route)
  expect(planned.blocked).toBeNull()
  expect(planned.skipped).toEqual({ pending: 1 })
  expect(planned.replaced).toBe(0)
  expect(planned.lines).toMatchObject([
    {
      account: 'Revolut Current',
      added: 3,
      known: 0,
      net: cents(-106.15),
      closing: cents(893.85),
      from: noon(5, 9),
      to: noon(7, 8),
      coverage: {
        state: 'ledger',
        from: noon(5, 9),
        to: noon(7, 8),
        opening: cents(1000),
        holes: [],
      },
    },
    {
      account: 'Revolut Savings',
      added: 1,
      known: 0,
      net: cents(100),
      closing: cents(450),
      from: noon(6, 10),
      to: noon(6, 10),
      coverage: {
        state: 'ledger',
        from: noon(6, 10),
        to: noon(6, 10),
        opening: cents(350),
        holes: [],
      },
    },
  ])

  await applyImport(db, planned)
  expect(await db.read(q.selectFrom('institution').select('name'))).toEqual([{ name: 'Revolut' }])
  expect(await db.read(q.selectFrom('account').select(['name', 'kind']).orderBy('name'))).toEqual([
    { name: 'Revolut Current', kind: 'manual' },
    { name: 'Revolut Savings', kind: 'manual' },
  ])
  expect(await db.read(q.selectFrom('asset').select(['id', 'decimals']))).toEqual([
    { id: 'fiat:EUR', decimals: 18 },
  ])
  expect(await memos()).toEqual(['Cafe', 'To savings', 'To savings', 'Metro'])
  expect(await balances()).toEqual([
    { name: 'Revolut Current', day: '2026-01-05', quantity: String(cents(995.5)) },
    { name: 'Revolut Current', day: '2026-01-06', quantity: String(cents(895.5)) },
    { name: 'Revolut Current', day: '2026-01-07', quantity: String(cents(893.85)) },
    { name: 'Revolut Savings', day: '2026-01-06', quantity: String(cents(450)) },
  ])
  const [kept] = await db.read(q.selectFrom('import').selectAll())
  expect(kept).toMatchObject({ name: 'january.csv', raw: january.text, tickers: '{}' })
  expect(Object.keys(JSON.parse(kept?.accounts ?? '{}'))).toEqual(['Current', 'Savings'])
})

test('an account the file names by its number is named after the bank and its last four digits, and found again by that name', async () => {
  const { db } = await open()
  const statement = {
    name: 'conta.xlsx',
    text: [
      'HISTÓRICO DE CONTA NÚMERO 12345678901\t\t\t\t',
      'Moeda:\tEUR',
      'Tipo:\tConta',
      'Data Lanc.\tData Valor\tDescrição\tValor\tSaldo',
      '05-01-2026\t05-01-2026\tSalary\t100\t100',
    ].join('\n'),
  }
  const { draft } = await read(db, [statement])
  expect(draft.controls.map(({ label, fresh }) => [label, fresh.name])).toEqual([
    ['12345678901', 'ActivoBank ••8901'],
  ])
  const institution = await createInstitution(db, 'ActivoBank', 1)
  const account = await createManualAccount(db, institution.id, 'ActivoBank ••8901')
  const { route } = await read(db, [statement], institution.id)
  expect(Object.values(route)).toEqual([{ state: 'account', accountId: account.id }])
})

test('the same file again is nothing new, and an overlapping one adds only its new rows with its own words', async () => {
  const { db, load, memos, balances } = await open()
  await load([january])
  const again = await read(db, [january])
  expect(again.draft.institution.fresh).toBe(false)
  expect(again.draft.controls).toEqual([])
  expect(plan(again.draft, again.route)).toMatchObject({
    blocked: { reason: 'nothing' },
    replaced: 0,
  })

  const planned = await load([january, later])
  expect(planned.replaced).toBe(0)
  expect(planned.lines).toMatchObject([
    { account: 'Revolut Current', added: 2, known: 3, closing: cents(2193.85) },
    { account: 'Revolut Savings', added: 0, known: 1, closing: cents(450) },
  ])
  expect(await memos()).toEqual([
    'Cafe',
    'To savings',
    'To savings',
    'Metro Lisboa',
    'Salary',
    'Rent',
  ])
  expect((await balances()).filter(({ name }) => name === 'Revolut Current')).toHaveLength(5)
  expect(
    (await ledger(db)).map(({ coverage }) => coverage.state === 'ledger' && coverage.holes),
  ).toEqual([[], []])
  expect(await db.read(q.selectFrom('institution').select('name'))).toEqual([{ name: 'Revolut' }])
  expect(await db.read(q.selectFrom('import').select('name').orderBy('name'))).toEqual([
    { name: 'january.csv' },
    { name: 'later.csv' },
  ])
})

test('the file whose last row is later wins a shared row and a shared day, whatever the order of import or of the drop', async () => {
  const { db, load, memos, balances } = await open()
  await load([later])
  await load([january])
  expect(await memos()).toContain('Metro Lisboa')

  await load([
    doc('evening.csv', [
      row('Current', '2026-01-09 09:30:00', 'Rent', '-700.00', '2193.85'),
      row('Current', '2026-01-09 21:00:00', 'Dinner', '-30.00', '2163.85'),
    ]),
  ])
  expect((await balances()).at(-2)).toEqual({
    name: 'Revolut Current',
    day: '2026-01-09',
    quantity: String(cents(2163.85)),
  })

  const twin = doc('twin.csv', [
    row('Current', '2026-01-09 09:30:00', 'Rent paid', '-700.00', '2193.85'),
  ])
  const { draft, route } = await read(db, [twin])
  const reversed = { ...draft, files: draft.files.toReversed() }
  expect(plan(reversed, route).entries).toEqual(plan(draft, route).entries)
})

test('a day is observed at the balance after its last row in ledger order, at its latest time, and a window spans its earliest and latest row', async () => {
  const { db, load, balances } = await open()
  const planned = await load([
    doc('day.csv', [
      row('Current', '2026-01-08 12:00:05', 'Salary', '2000.00', '2893.85'),
      row('Current', '2026-01-08 12:00:03', 'Rent', '-700.00', '2193.85'),
      row('Current', '2026-01-09 09:00:00', 'Tea', '-2.00', '2191.85'),
      row('Current', '2026-01-09 18:00:00', 'Bus', '-1.85', '2190.00'),
    ]),
  ])
  expect(planned.lines[0]).toMatchObject({
    closing: cents(2190),
    coverage: { opening: cents(893.85), holes: [] },
  })
  expect(planned.observations.map(({ time, quantity }) => [time, quantity])).toEqual([
    [Date.UTC(2026, 0, 8, 12, 0, 5), String(cents(2193.85))],
    [noon(9, 18), String(cents(2190))],
  ])
  const [kept] = await db.read(q.selectFrom('import').select('id'))
  await removeImport(db, kept?.id ?? '')
  expect(await balances()).toEqual([])
})

test('a plan joins the imports of its own institution only', async () => {
  const { db, load } = await open()
  const [first, second] = [
    await createInstitution(db, 'First'),
    await createInstitution(db, 'Second'),
  ]
  await load([january], first.id)
  const planned = await load([later], second.id)
  expect(planned.lines).toMatchObject([{ added: 3, known: 0 }])
  expect(await imports(db, second.id)).toMatchObject([{ name: 'later.csv' }])
})

test('removing an import takes its rows and its balances along, and what remains is rebuilt from the other files', async () => {
  const { db, load, memos, balances } = await open()
  await load([january, later])
  const [first, second] = await db.read(q.selectFrom('import').select('id').orderBy('name'))
  await removeImport(db, second?.id ?? '')
  expect(await memos()).toEqual(['Cafe', 'To savings', 'To savings', 'Metro'])
  expect(await balances()).toHaveLength(4)

  await removeImport(db, first?.id ?? '')
  expect(await memos()).toEqual([])
  expect(await balances()).toEqual([])
  expect(await db.read(q.selectFrom('import').select('id'))).toEqual([])
  expect(await db.read(q.selectFrom('account').select('name'))).toHaveLength(2)
  await expect(removeImport(db, 'missing')).rejects.toThrow('Unknown import.')
})

test('a file can feed an account that exists: typed balances the write removes are counted, one outside every period stays as a check', async () => {
  const { db, balances, typed } = await open()
  const institution = await createInstitution(db, 'Bank')
  const account = await createManualAccount(db, institution.id, 'Everyday')
  await createEvmAccount(db, institution.id, '0x00000000000000000000000000000000000000aa')
  await db.write(
    q.insertInto('asset').values([coin('fiat:EUR', 'EUR'), coin('fiat:USD', 'USD')]),
    typed(account.id, noon(1), cents(990)),
    typed(account.id, noon(6, 15), 5n),
    typed(account.id, noon(6, 15), 7n, 'fiat:USD'),
  )
  const { draft, route } = await read(db, [later], institution.id)
  expect(draft.accounts).toEqual([{ id: account.id, name: 'Everyday' }])
  const [control] = draft.controls
  const chosen: Route = {
    ...route,
    [control?.key ?? '']: { state: 'account', accountId: account.id },
  }
  const planned = plan(draft, chosen)
  expect(planned).toMatchObject({ replaced: 0, accounts: [] })
  expect(planned.lines[0]?.coverage).toMatchObject({ opening: cents(990) })

  const both = await read(db, [january, later], institution.id)
  const everyday = Object.fromEntries(
    both.draft.controls.map(({ key, label, fresh }) => [
      key,
      label === 'Current' ? { state: 'account' as const, accountId: account.id } : fresh,
    ]),
  )
  const wider = plan(both.draft, everyday)
  expect(wider.replaced).toBe(1)
  expect(wider.lines[0]).toMatchObject({
    account: 'Everyday',
    closing: cents(2193.85),
    coverage: { opening: cents(990), holes: [{ from: noon(1), to: noon(5, 9) }] },
  })
  await applyImport(db, wider)
  expect((await balances()).filter(({ name }) => name === 'Everyday')).toEqual([
    { name: 'Everyday', day: '2026-01-01', quantity: String(cents(990)) },
    { name: 'Everyday', day: '2026-01-05', quantity: String(cents(995.5)) },
    { name: 'Everyday', day: '2026-01-06', quantity: String(cents(895.5)) },
    { name: 'Everyday', day: '2026-01-06', quantity: '7' },
    { name: 'Everyday', day: '2026-01-07', quantity: String(cents(893.85)) },
    { name: 'Everyday', day: '2026-01-08', quantity: String(cents(2893.85)) },
    { name: 'Everyday', day: '2026-01-09', quantity: String(cents(2193.85)) },
  ])

  await db.write(typed(account.id, noon(8, 7), cents(777)))
  const next = await read(
    db,
    [doc('more.csv', [row('Current', '2026-01-10 09:00:00', 'Tea', '-2.00', '2191.85')])],
    institution.id,
  )
  expect(plan(next.draft, next.route).replaced).toBe(1)
})

test('two products of one bank cannot feed one account, in one file or across files, and a product without a target blocks', async () => {
  const { db, load } = await open()
  const { draft, route } = await read(db, [january])
  const [current, savings] = draft.controls
  const to = route[current?.key ?? '']
  expect(plan(draft, { ...route, [savings?.key ?? '']: to as never }).blocked).toEqual({
    reason: 'shared',
    label: 'Savings',
  })
  expect(plan(draft, { [current?.key ?? '']: to as never }).blocked).toEqual({
    reason: 'unrouted',
    label: 'Savings',
  })

  await load([later])
  const only = doc('savings.csv', [
    row('Savings', '2026-01-06 10:00:00', 'Saved', '100.00', '450.00'),
  ])
  const second = await read(db, [only])
  const [control] = second.draft.controls
  const [fed] = second.draft.accounts
  const shared: Route = { [control?.key ?? '']: { state: 'account', accountId: fed?.id ?? '' } }
  expect(plan(second.draft, shared).blocked).toEqual({ reason: 'shared', label: 'Savings' })
})

test('two rows of one file under one key block, named with the row', async () => {
  const { db } = await open()
  const { draft, route } = await read(db, [january])
  const files = draft.files.map((file) => {
    const rows = [...file.statement.rows, ...file.statement.rows.slice(0, 1)]
    return { ...file, statement: { ...file.statement, rows } }
  })
  expect(plan({ ...draft, files }, route).blocked).toEqual({
    reason: 'twice',
    file: 'january.csv',
    ref: draft.files[0]?.statement.rows[0]?.ref ?? '',
  })
})

test('a product whose account was removed is asked again and the kept file follows the answer, and a removal never brings the account back', async () => {
  const { db, load, memos, account } = await open()
  await load([january, later])
  await remove(db, 'account', await account('Revolut Savings'))
  const [, newer] = await db.read(q.selectFrom('import').select('id').orderBy('name'))
  await removeImport(db, newer?.id ?? '')
  expect(await db.read(q.selectFrom('account').select('name'))).toEqual([
    { name: 'Revolut Current' },
  ])
  expect(await memos()).toEqual(['Cafe', 'To savings', 'Metro'])

  const { draft, route } = await read(db, [later])
  expect(draft.controls.map(({ label }) => label)).toEqual(['Savings'])
  await applyImport(db, plan(draft, route))
  expect(await memos()).toHaveLength(6)
  const [kept] = await db.read(
    q.selectFrom('import').select('accounts').where('name', '=', 'january.csv'),
  )
  expect(JSON.parse(kept?.accounts ?? '{}').Savings).toBe(await account('Revolut Savings'))
})

test('an import started from an account feeds it when the files bring one new product, ahead of the account named like it, unless a kept file feeds it already', async () => {
  const { db } = await open()
  const institution = await createInstitution(db, 'Bank')
  const account = await createManualAccount(db, institution.id, 'Everyday')
  const one = await read(db, [later], institution.id, account.id)
  expect(Object.values(one.route)).toEqual([{ state: 'account', accountId: account.id }])
  const two = await read(db, [january], institution.id, account.id)
  expect(Object.values(two.route).map(({ state }) => state)).toEqual(['new', 'new'])
  const elsewhere = await read(db, [later], institution.id, 'a9')
  expect(Object.values(elsewhere.route).map(({ state }) => state)).toEqual(['new'])
  const spare = await createManualAccount(db, institution.id, 'Revolut Current')
  expect((await read(db, [later], institution.id, account.id)).route).toEqual(one.route)

  await applyImport(db, plan(one.draft, one.route))
  const fed = await read(db, [january], institution.id, account.id)
  expect(Object.values(fed.route).map(({ state }) => state)).toEqual(['new'])
  expect(plan(fed.draft, fed.route).blocked).toBeNull()

  await applyImport(db, plan(fed.draft, fed.route))
  await remove(db, 'account', Object.values(fed.route)[0]?.accountId ?? '')
  const dead = await read(db, [later], institution.id, spare.id)
  expect(Object.values(dead.route).map(({ state }) => state)).toEqual(['new'])
})

test('a label new to the institution goes to the account already named like it, and a file outside an institution to the institution named like its bank', async () => {
  const { db, load } = await open()
  await load([january])
  const [kept] = await db.read(q.selectFrom('import').select('id'))
  await removeImport(db, kept?.id ?? '')
  const planned = await load([january])
  expect(planned).toMatchObject({ institution: { fresh: false }, accounts: [] })
  expect(await db.read(q.selectFrom('institution').select('id'))).toHaveLength(1)
  expect(await db.read(q.selectFrom('account').select('id'))).toHaveLength(2)
})

test('a file without a booked row, or one that is already kept, is not stored again', async () => {
  const { db, load } = await open()
  await load([doc('pending.csv', [pending]), january])
  expect(await db.read(q.selectFrom('import').select('name'))).toEqual([{ name: 'january.csv' }])
  expect((await read(db, [later])).draft.institution.fresh).toBe(false)

  await load([january, later, later])
  expect(await db.read(q.selectFrom('import').select('name').orderBy('name'))).toEqual([
    { name: 'january.csv' },
    { name: 'later.csv' },
  ])
})

test('an apply is refused when the imports of the institution changed since the files were read', async () => {
  const { db, load } = await open()
  await load([january])
  const { draft, route } = await read(db, [later])
  const [kept] = await db.read(q.selectFrom('import').select('id'))
  await removeImport(db, kept?.id ?? '')
  await expect(applyImport(db, plan(draft, route))).rejects.toThrow('changed')
})

test('an entry recorded by hand survives every rebuild', async () => {
  const { db, load, memos, account } = await open()
  await load([january])
  await db.write(
    q.insertInto('entry').values({
      accountId: await account('Revolut Current'),
      ref: 'user:1',
      leg: 'asset',
      time: noon(2),
      kind: 'trade',
      assetId: 'fiat:EUR',
      quantity: '1',
      memo: 'By hand',
    }),
  )
  await load([later])
  expect(await memos()).toContain('By hand')
})

test('an import goes with the last account it feeds, with its institution too, and the institution page lists what is kept', async () => {
  const { db, load } = await open()
  await load([january])
  const [institution] = await db.read(q.selectFrom('institution').select('id'))
  expect(await imports(db, institution?.id ?? '')).toMatchObject([{ name: 'january.csv' }])
  const accounts = await db.read(q.selectFrom('account').select('id'))
  await remove(db, 'account', accounts[0]?.id ?? '')
  expect(await db.read(q.selectFrom('import').select('id'))).toHaveLength(1)
  await remove(db, 'account', accounts[1]?.id ?? '')
  expect(await db.read(q.selectFrom('import').select('id'))).toEqual([])

  await load([january], institution?.id)
  await remove(db, 'institution', institution?.id ?? '')
  expect(await db.read(q.selectFrom('import').select('id'))).toEqual([])
})

test('a file no parser knows is refused with its first line only, and one a parser cannot read by its name', async () => {
  const { db } = await open()
  const other = { name: 'other.csv', text: 'Date;Words;Balance\r\n01-02-2026;Cafe;1 234,56\r\n' }
  await expect(read(db, [other])).rejects.toThrow(
    new Error('other.csv: it is not an export garner knows. It starts with: Date;Words;Balance'),
  )
  const broken = doc('broken.csv', [row('Current', '06/01/2026', 'Bad date', '1.00', '1.00')])
  await expect(read(db, [broken])).rejects.toThrow(
    'broken.csv: Row 2: the completed date is unreadable.',
  )
  for (const currency of ['BTC', 'eur', ''])
    await expect(
      read(db, [
        doc('coins.csv', [row('Current', '2026-01-05 09:00:00', 'Coin', '1.00', '1.00', currency)]),
      ]),
    ).rejects.toThrow('coins.csv: it holds assets that are not currencies')
  await expect(read(db, [january], 'w9')).rejects.toThrow('Unknown institution.')
  await expect(read(db, [decode('book.xls', book())])).rejects.toThrow(
    'book.xls: it is not an export garner knows. It starts with: Title',
  )
})

test('a second currency of a product is its own line, and unknown types are counted by name', async () => {
  const { db, load, balances } = await open()
  const cashback =
    'Cashback,Current,2026-01-05 10:00:00,2026-01-05 10:00:00,Reward,1.00,0.00,USD,COMPLETED,11.00'
  const { draft, route } = await read(db, [
    doc('two.csv', [...january.text.split('\n').slice(1, 2), cashback]),
  ])
  const planned = plan(draft, route)
  expect(planned.unknown).toEqual({ Cashback: 1 })
  expect(planned.lines).toMatchObject([
    { account: 'Revolut Current', assetId: 'fiat:EUR' },
    { account: 'Revolut Current', assetId: 'fiat:USD' },
  ])
  await applyImport(db, planned)
  await load([
    doc('usd.csv', [row('Current', '2026-01-06 10:00:00', 'Tea', '-1.00', '10.00', 'USD')]),
  ])
  expect((await balances()).map(({ day, quantity }) => [day, quantity])).toEqual([
    ['2026-01-05', String(cents(995.5))],
    ['2026-01-05', String(cents(11))],
    ['2026-01-06', String(cents(10))],
  ])
})

const folder = 'sample-data'

test.skipIf(!existsSync(folder))(
  'the real exports import without a hole, each one alone and all together, and close at the last printed balance',
  async () => {
    const files = readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map(({ name }) => decode(name, readFileSync(`${folder}/${name}`)))
    const banks = parsers
      .map((parser) => ({ parser, docs: files.filter((doc) => parser.detect(view(doc.text))) }))
      .filter(({ docs }) => docs.length > 0)
    expect(banks).toHaveLength(parsers.length)
    for (const { parser, docs } of banks)
      for (const set of [...docs.map((doc) => [doc]), docs]) {
        const { db } = await open()
        const { draft, route } = await read(db, set)
        const planned = plan(draft, route)
        expect(planned.blocked).toBeNull()
        expect(Object.keys(planned.unknown)).toEqual([])
        const last = new Map(
          set
            .flatMap((doc) => parser.parse(view(doc.text)).rows)
            .toSorted((a, b) => a.time - b.time)
            .map(({ label, balance }) => [label, balance]),
        )
        const labels = new Map(draft.controls.map(({ label, fresh }) => [fresh.name, label]))
        for (const { account, closing, coverage } of planned.lines) {
          expect(coverage.state === 'ledger' && coverage.holes).toEqual([])
          expect(closing).toBe(last.get(labels.get(account) ?? '') ?? 0n)
        }
        await applyImport(db, planned)
        const rows = await db.read(
          q.selectFrom('entry').select((eb) => eb.fn.countAll().as('rows')),
        )
        expect(rows[0]?.rows).toBe(planned.entries.length)
        const again = await read(db, set)
        expect(plan(again.draft, again.route).blocked).toEqual({ reason: 'nothing' })
      }
  },
)

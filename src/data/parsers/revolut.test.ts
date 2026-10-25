import { expect, test } from 'bun:test'
import type { Row } from '../statement'
import { revolut } from './revolut'

const header =
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance'
const lines = [
  'Card Payment,Current,2026-01-05 09:12:44,2026-01-06 6:11:59,"Cafe Lisboa, Chiado",-4.50,0.00,EUR,COMPLETED,995.50',
  'Transfer,Current,2026-01-06 10:00:00,2026-01-06 10:00:00,To EUR Savings,-100.00,0.00,EUR,COMPLETED,895.50',
  'Card Payment,Current,2026-01-07 08:00:01,2026-01-07 08:00:01,Metro,-1.65,0.00,EUR,COMPLETED,893.85',
  'Card Payment,Current,2026-01-07 08:00:01,2026-01-07 08:00:01,Metro Baixa,-1.65,0.00,EUR,COMPLETED,892.20',
  'Charge,Current,2026-01-08 00:00:00,2026-01-08 00:00:05,Plan fee,0.00,9.99,EUR,COMPLETED,882.21',
  'EXCHANGE,Current,2026-01-09 11:00:00,2026-01-09 11:00:00,Exchanged to USD,-50.00,0.50,EUR,COMPLETED,831.71',
  'Cashback,Current,2026-01-10 12:00:00,2026-01-10 12:00:00,Cashback,0.25,0.00,EUR,COMPLETED,831.96',
  'Card Payment,Current,2026-01-11 13:00:00,,Pending shop,-20.00,0.00,EUR,PENDING,',
  'Card Payment,Current,2026-01-11 14:00:00,2026-01-11 14:05:00,Reverted shop,-30.00,0.00,EUR,REVERTED,801.96',
  'Transfer,Savings,2026-01-06 10:00:00,2026-01-06 10:00:00,To EUR Savings,100.00,0.00,EUR,COMPLETED,450.00',
]
const doc = (rows: readonly string[]) => `${[header, ...rows].join('\n')}\n`
const cents = (value: number) => BigInt(Math.round(value * 100)) * 10n ** 16n
const keys = (rows: readonly Row[]) => rows.map(({ label, ref }) => `${label} ${ref}`)

test('a statement is detected by its header and nothing else', () => {
  expect(revolut.detect(doc(lines))).toBe(true)
  expect(revolut.detect(`\uFEFF${header.toUpperCase()}\r\n`)).toBe(true)
  expect(revolut.detect(`${header},Extra\n`)).toBe(false)
  expect(revolut.detect('Date,Amount,Balance\n')).toBe(false)
})

test('completed rows become rows with legs, the rest is counted by its state', () => {
  const { rows, skipped, unknown } = revolut.parse(doc(lines))
  expect(skipped).toEqual({ pending: 1, reverted: 1 })
  expect(unknown).toEqual({ Cashback: 1 })
  expect(keys(rows)).toEqual([
    'Current row:20260106061159:EUR:-4.5:0',
    'Current row:20260106100000:EUR:-100:0',
    'Current row:20260107080001:EUR:-1.65:0',
    'Current row:20260107080001:EUR:-1.65:1',
    'Current row:20260108000005:EUR:0:0',
    'Current row:20260109110000:EUR:-50:0',
    'Current row:20260110120000:EUR:0.25:0',
    'Savings row:20260106100000:EUR:100:0',
  ])
  expect(rows[0]).toEqual({
    label: 'Current',
    unit: { fiat: 'EUR' },
    time: Date.UTC(2026, 0, 6, 6, 11, 59),
    ref: 'row:20260106061159:EUR:-4.5:0',
    legs: [{ leg: 'amount', kind: 'transfer', amount: cents(-4.5) }],
    balance: cents(995.5),
    peer: null,
    memo: 'Cafe Lisboa, Chiado',
  })
  expect(rows[4]?.legs).toEqual([{ leg: 'fee', kind: 'fee', amount: cents(-9.99) }])
  expect(rows[5]?.legs).toEqual([
    { leg: 'amount', kind: 'trade', amount: cents(-50) },
    { leg: 'fee', kind: 'fee', amount: cents(-0.5) },
  ])
  expect(rows[6]?.legs).toEqual([{ leg: 'amount', kind: 'transfer', amount: cents(0.25) }])
})

test('a fee handed back is a transfer leg, never a positive fee', () => {
  const refund =
    'Charge,Current,2026-01-08 00:00:00,2026-01-08 00:00:05,Fee back,0.00,-9.99,EUR,COMPLETED,1005.49'
  expect(revolut.parse(doc([lines[0] ?? '', refund])).rows[1]?.legs).toEqual([
    { leg: 'fee', kind: 'transfer', amount: cents(9.99) },
  ])
})

test('amounts are exact at 18 decimals and never pass through a float', () => {
  const dust =
    'Transfer,Vault,x,2026-01-06 10:00:00,Dust,0.000000000000000001,0.00,EUR,COMPLETED,9007199254740993.000000000000000001'
  const [row] = revolut.parse(doc([dust])).rows
  expect(row?.legs).toEqual([{ leg: 'amount', kind: 'transfer', amount: 1n }])
  expect(row?.balance).toBe(9007199254740993n * 10n ** 18n + 1n)
})

test('two windows of one account give the rows they share the same keys', () => {
  const older = keys(revolut.parse(doc(lines.slice(0, 5))).rows)
  const newer = keys(revolut.parse(doc(lines.slice(2))).rows)
  expect(older.filter((key) => newer.includes(key))).toEqual([
    'Current row:20260107080001:EUR:-1.65:0',
    'Current row:20260107080001:EUR:-1.65:1',
    'Current row:20260108000005:EUR:0:0',
  ])
  expect(new Set([...older, ...newer]).size).toBe(8)
})

test('a file printed newest first reads the same', () => {
  const current = lines.filter((line) => line.includes(',Current,'))
  expect(revolut.parse(doc(current.toReversed())).rows).toEqual(revolut.parse(doc(current)).rows)
})

test('an unreadable row is refused with its row number and never echoes a cell', () => {
  const parse = (row: string) => () => revolut.parse(doc([lines[0] ?? '', row]))
  expect(parse('Transfer,Current,x,06/01/2026,Bad date,1.00,0.00,EUR,COMPLETED,996.50')).toThrow(
    'Row 3: the completed date is unreadable.',
  )
  expect(
    parse('Transfer,Current,x,2026-01-06 10:00:00,Bad sum,"1,00",0.00,EUR,COMPLETED,996.50'),
  ).toThrow('Row 3: the amount is unreadable.')
  expect(
    parse('Transfer,Current,x,2026-01-06 10:00:00,Odd state,1.00,0.00,EUR,FROZEN,996.50'),
  ).toThrow('Row 3: the state is not known.')
})

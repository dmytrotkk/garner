import { expect, test } from 'bun:test'
import { parseUnits } from 'viem'
import { revolut } from './revolut.ts'
import { santander } from './santander.ts'

const header = 'Operation date\tEffective date\tDescription\tAmount( EUR )\tAccount balance( EUR )'
const doc = (...rows: readonly string[]) =>
  ['Monday, January 5, 2026', 'Account movements', header, ...rows].join('\n')
const eur = (value: string) => parseUnits(value, 18)
const noon = (day: number) => Date.UTC(2026, 0, day, 12)
const row = (time: number, amount: string, balance: string, memo: string | null) => ({
  label: '',
  unit: { fiat: 'EUR' },
  time,
  ref: `row:${new Date(time).toISOString().slice(0, 10).replaceAll('-', '')}:EUR:${amount}:0`,
  legs: eur(amount) ? [{ leg: 'amount', kind: 'transfer' as const, amount: eur(amount) }] : [],
  balance: eur(balance),
  peer: null,
  memo,
})

test('a Santander table is read oldest first, each row at noon plus its place in the day', () => {
  const file = doc(
    '06-01-2026\t07-01-2026\tCafe \t-4.5\t95.5',
    '05-01-2026\t05-01-2026\tSalary\t100\t100',
    '05-01-2026\t05-01-2026\t\t0\t0',
  )
  expect(santander.detect(file)).toBe(true)
  expect(revolut.detect(file)).toBe(false)
  expect(santander.parse(file)).toEqual({
    rows: [
      row(noon(5), '0', '0', null),
      row(noon(5) + 1, '100', '100', 'Salary'),
      row(noon(6), '-4.5', '95.5', 'Cafe'),
    ],
    skipped: {},
    unknown: {},
  })
})

test('a day whose rows balance both ways stays oldest first, as a table bank prints newest first', () => {
  const rows = santander.parse(
    doc('05-01-2026\t\tRefund\t5\t100', '05-01-2026\t\tBuy\t-5\t95'),
  ).rows
  expect(rows.map(({ memo, balance }) => [memo, balance])).toEqual([
    ['Buy', eur('95')],
    ['Refund', eur('100')],
  ])
})

test('an unreadable cell names its row and column', () => {
  expect(() => santander.parse(doc('2026-01-05\t\tCafe\t-4.5\t95.5'))).toThrow(
    'Row 4: the date is unreadable.',
  )
  expect(() => santander.parse(doc('31-02-2026\t\tCafe\t-4.5\t95.5'))).toThrow(
    'Row 4: the date is unreadable.',
  )
  expect(() => santander.parse(doc('05-01-2026\t\tCafe\tx\t95.5'))).toThrow(
    'Row 4: the amount is unreadable.',
  )
})

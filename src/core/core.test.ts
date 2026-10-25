import { expect, test } from 'bun:test'
import { date, money, percent, quantity, short, tick, title, units } from './format'
import { uuidv7 } from './id'

test('uuidv7 is well formed and sorts by time', () => {
  const [first, second] = [uuidv7(1_000), uuidv7(2_000)]
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(first < second).toBe(true)
  const now = Date.UTC(2026, 8, 20)
  expect(uuidv7(now).replace('-', '').slice(0, 12)).toBe(now.toString(16).padStart(12, '0'))
})

test('formatting', () => {
  expect(money(123456.789, 'USD')).toBe('$123,456.79')
  expect(money(123456.789, 'EUR')).toBe('€123,456.79')
  expect(money(234567.89, 'USD', 'compact')).toBe('$234.6K')
  expect(money(0, 'EUR', 'compact')).toBe('€0')
  expect([3810, 3845, 3880, 3915].map((value) => tick(value, 28.3, 'USD'))).toEqual([
    '$3.81K',
    '$3.85K',
    '$3.88K',
    '$3.92K',
  ])
  expect([2.18e6, 2.2e6, 2.22e6, 2.24e6].map((value) => tick(value, 20_000, 'EUR'))).toEqual([
    '€2.18M',
    '€2.2M',
    '€2.22M',
    '€2.24M',
  ])
  expect([0, 25, 50, 75].map((value) => tick(value, 25, 'USD'))).toEqual([
    '$0',
    '$25',
    '$50',
    '$75',
  ])
  expect(tick(234567.89, 50_000, 'USD')).toBe('$234.6K')
  expect(tick(4999.999999999999, 3e-13, 'EUR')).toBe('€5K')
  expect(tick(0, 0, 'USD')).toBe('$0')
  expect(short('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe('0xd8da…6045')
  expect(units(1_500_000n, 6)).toBe(1.5)
  expect(money(2579.907, 'USD', 'price')).toBe('$2,579.91')
  expect(money(0.0000037979, 'USD', 'price')).toBe('$0.000003798')
  expect(quantity(4.315097)).toBe('4.3151')
  expect(quantity(10000000000)).toBe('10,000,000,000')
  expect(percent(0.4236)).toBe('42.4%')
  expect(date(Date.UTC(2026, 8, 20, 12))).toBe('Sep 20, 2026')
  expect(title('Add account')).toBe('Add Account')
  expect(title('Not a transfer')).toBe('Not a Transfer')
  expect(title('Transfer to…')).toBe('Transfer To…')
  expect(title('Show values in EUR')).toBe('Show Values in EUR')
})

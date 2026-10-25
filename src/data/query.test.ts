import { expect, test } from 'bun:test'
import { parseUnits } from 'viem'
import type { Assignment, Movement } from './ledger'
import { holds, literal, parse, reading } from './query'
import type { CategoryType, Day } from './schema'

const today: Day = '2026-10-20'
const read = (input: string) => reading(parse(input, today))

const readings: Record<string, string> = {
  today: 'Movements on Oct 20, 2026',
  yesterday: 'Movements on Oct 19, 2026',
  'this week': 'Movements from Oct 19 to Oct 25, 2026',
  'last week': 'Movements from Oct 12 to Oct 18, 2026',
  'this month': 'Movements in October 2026',
  'last month': 'Movements in September 2026',
  'this quarter': 'Movements in Q4 2026',
  'last quarter': 'Movements in Q3 2026',
  'this year': 'Movements in 2026',
  'last year': 'Movements in 2025',
  'last 30 days': 'Movements from Sep 21 to Oct 20, 2026',
  'past 2 weeks': 'Movements from Oct 7 to Oct 20, 2026',
  'last 3 months': 'Movements from Aug to Oct 2026',
  'last 1 month': 'Movements in October 2026',
  'last 2 years': 'Movements from 2025 to 2026',
  q1: 'Movements in Q1 2026',
  q4: 'Movements in Q4 2026',
  'q1 2025': 'Movements in Q1 2025',
  march: 'Movements in March 2026',
  november: 'Movements in November 2025',
  'march 2025': 'Movements in March 2025',
  'oct 2026': 'Movements in October 2026',
  'mar 12': 'Movements on Mar 12, 2026',
  'mar 25': 'Movements on Mar 25, 2026',
  'Oct 20, 2026': 'Movements on Oct 20, 2026',
  mar: 'Movements matching "mar"',
  dec: 'Movements matching "dec"',
  'since dec': 'Movements from Dec 1, 2025 to Oct 20, 2026',
  'since june': 'Movements from Jun 1 to Oct 20, 2026',
  'between mar and may': 'Movements from Mar to May 2026',
  'nov to jan': 'Movements from Nov 2025 to Jan 2026',
  'oct to dec': 'Movements in Q4 2026',
  'march 2025 to may': 'Movements from Mar to May 2025',
  'aug to oct': 'Movements from Aug to Oct 2026',
  '2024 to 2025': 'Movements from 2024 to 2025',
  '2025': 'Movements in 2025',
  '2045': 'Movements of 2,045',
  '1999': 'Movements of 1,999',
  'march 1500': 'Movements of 1,500 in March 2026',
  'feb 30': 'Movements of 30 in February 2026',
  'feb 29': 'Movements on Feb 29, 2024',
  '20 oct': 'Movements of 20 in October 2026',
  'oct 1-15': 'Movements of 15 on Oct 1, 2026',
  '82': 'Movements of 82',
  '82.5': 'Movements of 82.5',
  '12,50': 'Movements of 12.50',
  '1,200': 'Movements of 1,200',
  '1.200': 'Movements of 1,200',
  '2,000': 'Movements of 2,000',
  '1.234,56': 'Movements of 1,234.56',
  '0.005': 'Movements of 0.005',
  '0,500': 'Movements of 0.500',
  '0042': 'Movements matching "0042"',
  'over 50': 'Movements over 50',
  'more than 500': 'Movements over 500',
  'above 10': 'Movements over 10',
  'less than 5': 'Movements under 5',
  'below 3': 'Movements under 3',
  'over 100 under 200': 'Movements over 100 and under 200',
  'under 5 coffee': 'Movements matching "coffee" under 5',
  '50 to 100': 'Movements of 50 to 100',
  'between 50 and 100': 'Movements of 50 to 100',
  '50-100': 'Movements of 50 to 100',
  '50 - 100': 'Movements of 50 to 100',
  '50–100': 'Movements of 50 to 100',
  '"10-20"': 'Movements matching "10 20"',
  spent: 'Spent',
  spending: 'Spent',
  received: 'Received',
  uncategorised: 'Uncategorized',
  'spent received': 'Spent and received',
  'spent 50': 'Spent 50',
  'uncategorized over 100': 'Uncategorized over 100',
  'spent groceries last month': 'Spent matching "groceries" in September 2026',
  'how much did i spend on eating out this year': 'Spent matching "eating out" in 2026',
  'show me my movements': 'Movements',
  '“march”': 'Movements matching "march"',
  '"march': 'Movements matching "march"',
  marco: 'Movements matching "marco"',
  'Pingo Doce': 'Movements matching "Pingo Doce"',
}

test('every vocabulary form reads as its sentence, resolved on Oct 20, 2026', () => {
  for (const [input, sentence] of Object.entries(readings))
    expect([input, read(input)]).toEqual([input, sentence])
})

test('every reading parses back to itself and holds no dash', () => {
  for (const input of Object.keys(readings)) {
    const sentence = read(input)
    expect(read(sentence)).toBe(sentence)
    expect(sentence).not.toMatch(/[–—]/)
  }
})

test('the words row quotes every one-word facet and never splits a longer one', () => {
  expect(literal('march', today)).toBe('"march"')
  expect(literal('may lee', today)).toBe('"may" lee')
  expect(literal('q3 2025', today)).toBeUndefined()
  expect(literal('pingo doce', today)).toBeUndefined()
  expect(read(literal('21345 678 123', today) ?? '')).toBe('Movements matching "21345 678 123"')
})

const types: Record<string, CategoryType> = {
  groceries: 'expense',
  salary: 'income',
  savings: 'transfer',
}
const ruled = (categoryId: string): Assignment => ({
  state: 'ruled',
  party: 'x',
  categoryId,
  source: 'user',
})
const open: Assignment = { state: 'open', party: 'x' }
const key = { accountId: 'a', ref: 'r', leg: 'amount' }

const row = (
  amount: string,
  assignment: Assignment = open,
  time = Date.UTC(2026, 9, 15),
  transfer: Extract<Movement, { kind: 'transfer' }>['transfer'] = { state: 'unmatched' },
): Movement => ({
  accountId: 'a',
  ref: 'r',
  time,
  memo: 'x',
  assetId: 'fiat:EUR',
  quantity: parseUnits(amount, 18),
  note: null,
  kind: 'transfer',
  key,
  fee: 0n,
  transfer,
  party: 'x',
  assignment,
  identity: { state: 'open' },
})

const typeOf = (moved: Movement) =>
  moved.kind !== 'trade' && 'categoryId' in moved.assignment
    ? types[moved.assignment.categoryId]
    : undefined

const passes = (input: string, moved: Movement) => holds(parse(input, today).facets, typeOf)(moved)

test('the flags count rows as the month headers do', () => {
  const paired = row('-50', open, undefined, {
    state: 'paired',
    via: 'twin',
    with: key,
    sent: 1n,
    received: 1n,
  })
  const pocket = row('-50', ruled('savings'))
  const refund = row('12', ruled('groceries'))
  const shop = row('-12', ruled('groceries'))
  const salary = row('900', ruled('salary'))
  const unknown = row('-7')
  const fee: Movement = {
    ...unknown,
    kind: 'fee',
    party: 'x',
    assignment: open,
    identity: { state: 'open' },
  }
  const trade: Movement = { ...unknown, kind: 'trade' }
  const flags = (moved: Movement) =>
    ['spent', 'received', 'uncategorized'].filter((flag) => passes(flag, moved))
  expect(flags(paired)).toEqual(['uncategorized'])
  expect(flags(pocket)).toEqual([])
  expect(flags(refund)).toEqual(['spent', 'received'])
  expect(flags(shop)).toEqual(['spent'])
  expect(flags(salary)).toEqual(['received'])
  expect(flags(unknown)).toEqual(['spent', 'uncategorized'])
  expect(flags(fee)).toEqual(['spent', 'uncategorized'])
  expect(flags(trade)).toEqual([])
})

test('periods hold whole UTC days at both edges, amounts compare the size at their precision', () => {
  const at = (time: number) => row('-1', open, time)
  expect(passes('october', at(Date.UTC(2026, 9, 31, 23, 30)))).toBe(true)
  expect(passes('october', at(Date.UTC(2026, 9, 1)))).toBe(true)
  expect(passes('october', at(Date.UTC(2026, 10, 1)))).toBe(false)
  expect(passes('october', at(Date.UTC(2026, 8, 30, 23, 59)))).toBe(false)
  const sized = (input: string, amounts: readonly string[]) =>
    amounts.map((amount) => passes(input, row(amount)))
  expect(sized('82', ['-82', '82.99', '83', '81.99'])).toEqual([true, true, false, false])
  expect(sized('82.50', ['82.5', '82.51'])).toEqual([true, false])
  expect(sized('50 to 100', ['50', '-100', '100.01', '49.99'])).toEqual([true, true, false, false])
  expect(sized('over 50', ['50', '-50.01'])).toEqual([false, true])
  expect(sized('under 20', ['20', '19.99'])).toEqual([false, true])
})

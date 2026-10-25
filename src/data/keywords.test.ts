import { expect, test } from 'bun:test'
import { keywords, suggest } from './keywords'
import { partyOf } from './ledger'
import type { Category } from './schema'

const category = (name: string, icon: Category['icon']): Category => ({
  id: name,
  name,
  icon,
  type: 'expense',
  hint: '',
  updatedAt: 0,
})
const all = [
  category('Eating out', 'restaurant'),
  category('Transfers', 'transfer'),
  category('Loans', 'handshake'),
  category('Groceries', 'basket'),
]

test('a suggestion comes from a word of the bank text, the longest match first, by the icon of the category', () => {
  expect(
    suggest(partyOf('TRF. P/O ANA SILVA'), all).map(({ category, why }) => [category.name, why]),
  ).toEqual([
    ['Transfers', 'trf'],
    ['Loans', 'p o'],
  ])
  expect(
    suggest(partyOf('COMPRA CAFE PASTELARIA LISBOA'), all).map(({ category, why }) => [
      category.name,
      why,
    ]),
  ).toEqual([['Eating out', 'pastelaria']])
  expect(suggest(partyOf('ACME PAYROLL'), all)).toEqual([])
})

test('every keyword is lowercase without accents, so it meets a party as partyOf prints it', () => {
  for (const words of Object.values(keywords))
    for (const word of words) expect(word).toBe(partyOf(word))
})

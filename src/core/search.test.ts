import { expect, test } from 'bun:test'
import { search } from './search'

const items = [
  { group: 'Go to', label: 'Settings', keywords: ['currency', 'privacy'] },
  { group: 'Actions', label: 'Add institution' },
  { group: 'Actions', label: 'Rename', note: 'Escrow' },
  { group: 'Institutions', label: 'Escrow' },
  { group: 'Institutions', label: 'Revolut' },
  { group: 'Accounts', label: 'Savings', note: 'Escrow', keywords: ['0xd8da6bf2'] },
  { group: 'Assets', label: 'USDC', note: 'USD Coin' },
  { group: 'Assets', label: 'ETH', note: 'Ethereum' },
  { group: 'Assets', label: 'COMP', note: 'Compound' },
  ...Array.from({ length: 6 }, (_, index) => ({ group: 'Assets', label: `T${index}` })),
  { group: 'Merchants', label: 'Bolt', note: 'Transport' },
  { group: 'Merchants', label: 'Uber', note: 'Transport' },
  { group: 'Merchants', label: 'User Shop', note: 'Shop' },
  { group: 'Merchants', label: 'Continente', note: 'Supermarket' },
  { group: 'Merchants', label: 'Café Central', note: 'Cafe' },
]

const labels = (query: string, limit?: number) =>
  search(items, query, limit).map(({ label, items }) => [label, items.map((item) => item.label)])

const found = (query: string) =>
  search(items, query).flatMap(({ items }) => items.map(({ label }) => label))

test('a blank query lists every group in order, capped by the limit', () => {
  expect(labels('', 2)).toEqual([
    ['Go to', ['Settings']],
    ['Actions', ['Add institution', 'Rename']],
    ['Institutions', ['Escrow', 'Revolut']],
    ['Accounts', ['Savings']],
    ['Assets', ['USDC', 'ETH']],
    ['Merchants', ['Bolt', 'Uber']],
  ])
  expect(labels('  ', 2)).toEqual(labels('', 2))
})

test('every word must match a label, a note or a keyword, folding case and accents both ways', () => {
  expect(found('ESCROW')).toEqual(['Escrow', 'Rename', 'Savings'])
  expect(found('sav escrow')).toEqual(['Savings'])
  expect(found('0xD8DA')).toEqual(['Savings'])
  expect(found('cafe')).toEqual(['Café Central'])
  expect(found('CAFÉ cent')).toEqual(['Café Central'])
  expect(found('privacy')).toEqual(['Settings'])
  expect(found('nothing here')).toEqual([])
  expect(found('…')).toEqual([])
})

test('a name start ranks over a name word, a note or keyword, then a typo, and groups follow their best row', () => {
  const ranked = [
    { group: 'Expenses', label: 'Groceries', note: 'Supermarkets, bakeries', keywords: ['lidl'] },
    { group: 'Expenses', label: 'Personal care', note: 'Hair, beauty', keywords: [] },
    { group: 'Expenses', label: 'Eating out', note: 'Restaurants, cafes', keywords: ['coffee'] },
    { group: 'Expenses', label: 'Iced coffee' },
    { group: 'Income', label: 'Coffee sales' },
    { group: 'Income', label: 'Rental income', note: 'Rent from property', keywords: [] },
  ]
  const order = (query: string) =>
    search(ranked, query).map(({ label, items }) => [label, items.map((item) => item.label)])
  expect(order('coffee')).toEqual([
    ['Income', ['Coffee sales']],
    ['Expenses', ['Iced coffee', 'Eating out']],
  ])
  expect(order('cofee')).toEqual([
    ['Income', ['Coffee sales']],
    ['Expenses', ['Iced coffee', 'Eating out']],
  ])
  expect(order('per')).toEqual([['Expenses', ['Personal care']]])
  expect(order('rent')).toEqual([['Income', ['Rental income']]])
})

test('a typo is a fallback with the first letter fixed, never under 4 letters or on digits', () => {
  expect(found('revolt')).toEqual(['Revolut'])
  expect(found('bolr')).toEqual(['Bolt'])
  expect(found('volt')).toEqual([])
  expect(found('contni')).toEqual(['Continente'])
  expect(found('contnente')).toEqual(['Continente'])
  expect(found('uber')).toEqual(['Uber'])
  expect(found('bot')).toEqual([])
  expect(found('0xd9da')).toEqual([])
})

test('the limit caps every group while typing', () => {
  expect(labels('t', 2)).toEqual([
    ['Assets', ['T0', 'T1']],
    ['Merchants', ['Bolt', 'Uber']],
  ])
  expect(labels('t').find(([label]) => label === 'Assets')?.[1]).toHaveLength(6)
})

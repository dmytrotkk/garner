import { expect, test } from 'bun:test'
import { Wallet01Icon } from '@hugeicons/core-free-icons'
import { markOf } from '../ui/marks.ts'
import { glyphOf } from './-institutions.tsx'

const evm = { kind: 'evm' } as const
const manual = { kind: 'manual' } as const

test('a known brand anywhere in the name as whole words gives its mark, case and accents aside', () => {
  const mark = markOf('revolut')
  if (!mark) throw new Error('no Revolut mark')
  expect(glyphOf({ name: 'Revolut', accounts: [manual] })).toEqual({ mark })
  expect(glyphOf({ name: 'Ledger', accounts: [evm] })).toEqual(
    glyphOf({ name: 'ledger', accounts: [] }),
  )
  expect(markOf('My Revolut Business')).toBe(markOf('Revolut'))
  expect(markOf('MONZÓ')).toBe(markOf('monzo'))
  expect(markOf('Crypto.com')).toBeDefined()
  expect(markOf('Deutsche Bank')).toBeDefined()
  expect(markOf('Ledger Nano')).toBe(markOf('ledger'))
  expect(markOf('Otherwise')).toBeUndefined()
  expect(markOf('Revolutionary')).toBeUndefined()
  expect(markOf('Caixa Geral de Depósitos')).toBeUndefined()
})

test('an institution of addresses only is a wallet, anything else its initial', () => {
  expect(glyphOf({ name: 'Validator', accounts: [evm, evm] })).toBe(Wallet01Icon)
  expect(glyphOf({ name: 'Mixed', accounts: [evm, manual] })).toEqual({ letter: 'M' })
  expect(glyphOf({ name: ' acme bank', accounts: [manual] })).toEqual({ letter: 'A' })
  expect(glyphOf({ name: 'Empty', accounts: [] })).toEqual({ letter: 'E' })
})

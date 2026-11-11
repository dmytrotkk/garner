import { table } from './table.ts'

export const santander = table({
  id: 'santander',
  name: 'Santander',
  header: [
    'operation date',
    'effective date',
    'description',
    'amount( eur )',
    'account balance( eur )',
  ],
  date: 0,
  memo: 2,
  amount: 3,
  balance: 4,
  unit: 'EUR',
})

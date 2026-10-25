import { table } from './table'

export const activobank = table({
  id: 'activobank',
  name: 'ActivoBank',
  header: ['data lanc.', 'data valor', 'descrição', 'valor', 'saldo'],
  date: 0,
  memo: 2,
  amount: 3,
  balance: 4,
  unit: /^moeda:\t([a-z]{3})\b/i,
  label: /conta número (\d+)/i,
})

import { expect, test } from 'bun:test'
import { parseUnits } from 'viem'
import { activobank } from './activobank.ts'
import { santander } from './santander.ts'

const header = 'Data Lanc.\tData Valor\tDescrição\tValor\tSaldo'
const preamble = [
  'HISTÓRICO DE CONTA NÚMERO 12345678901\t\t\t\t',
  'Moeda:\tEUR',
  '\t',
  'Tipo:\tConta',
  'Data de:\t01-01-2026',
  'Data até:\t31-01-2026',
]
const doc = (lines: readonly string[], ...rows: readonly string[]) =>
  [...lines, header, ...rows].join('\n')
const eur = (value: string) => parseUnits(value, 18)
const noon = (day: number) => Date.UTC(2026, 0, day, 12)

test('an ActivoBank table reads its currency and account number from the preamble, oldest first', () => {
  const file = doc(
    preamble,
    '05-01-2026\t05-01-2026\tSalary\t100\t100',
    '06-01-2026\t07-01-2026\tCafe \t-4.5\t95.5',
  )
  expect(activobank.detect(file)).toBe(true)
  expect(santander.detect(file)).toBe(false)
  expect(activobank.parse(file).rows).toEqual([
    {
      label: '12345678901',
      unit: { fiat: 'EUR' },
      time: noon(5),
      ref: 'row:20260105:EUR:100:0',
      legs: [{ leg: 'amount', kind: 'transfer', amount: eur('100') }],
      balance: eur('100'),
      peer: null,
      memo: 'Salary',
    },
    {
      label: '12345678901',
      unit: { fiat: 'EUR' },
      time: noon(6),
      ref: 'row:20260106:EUR:-4.5:0',
      legs: [{ leg: 'amount', kind: 'transfer', amount: eur('-4.5') }],
      balance: eur('95.5'),
      peer: null,
      memo: 'Cafe',
    },
  ])
})

test('a file without its currency or account number line is refused by name', () => {
  const row = '05-01-2026\t05-01-2026\tSalary\t100\t100'
  expect(() =>
    activobank.parse(
      doc(
        preamble.filter((line) => !line.startsWith('Moeda')),
        row,
      ),
    ),
  ).toThrow('The currency is not in the file.')
  expect(() => activobank.parse(doc(preamble.slice(1), row))).toThrow(
    'The account number is not in the file.',
  )
})

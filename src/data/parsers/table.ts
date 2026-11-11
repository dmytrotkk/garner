import { cells, chain, instant, keyed, type Parser, reader } from '../statement.ts'

type Mapping = {
  id: string
  name: string
  header: readonly string[]
  date: number
  memo: number
  amount: number
  balance: number
  unit: string | RegExp
  label?: RegExp
}

const dated = /^(\d{2})-(\d{2})-(\d{4})$/
const noon = 43_200_000

export function table({
  id,
  name,
  header,
  date,
  memo,
  amount,
  balance,
  unit,
  label,
}: Mapping): Parser {
  const titled = (line: readonly string[]) =>
    line.map((cell) => cell.trim().toLowerCase()).join('\t') === header.join('\t')
  return {
    id,
    name,
    detect: (text) => cells(text, '\t').some(titled),
    parse(text) {
      const lines = cells(text, '\t')
      const start = lines.findIndex(titled) + 1
      const preamble = lines.slice(0, start - 1).map((line) => line.join('\t'))
      const found = (pattern: RegExp, what: string) => {
        for (const line of preamble) {
          const match = pattern.exec(line)?.[1]
          if (match) return match
        }
        throw new Error(`The ${what} is not in the file.`)
      }
      const fiat = typeof unit === 'string' ? unit : found(unit, 'currency')
      const account = label ? found(label, 'account number') : ''
      const booked = lines.slice(start).map((line, index) => {
        const { fail, units } = reader(start + index + 1)
        const [, day, month, year] = dated.exec(line[date] ?? '') ?? []
        const at = instant([Number(year), Number(month), Number(day)])
        if (!year || !new Date(at.time).toISOString().startsWith(`${year}-${month}-${day}`))
          throw fail('the date is unreadable')
        return {
          ...at,
          moved: units(line[amount] ?? '', 'amount'),
          after: units(line[balance] ?? '', 'balance'),
          memo: line[memo]?.trim() || null,
        }
      })
      const ordered = chain(booked.toReversed(), ({ moved, after }) => ({
        series: fiat,
        delta: moved,
        balance: after,
      }))
      const key = keyed()
      const days = new Map<string, number>()
      return {
        rows: ordered.map(({ stamp, time, moved, after, memo }) => {
          const position = days.get(stamp) ?? 0
          days.set(stamp, position + 1)
          return {
            label: account,
            unit: { fiat },
            time: time + noon + position,
            ref: key({ label: account, stamp, unit: fiat, amount: moved }),
            legs: moved ? [{ leg: 'amount', kind: 'transfer', amount: moved }] : [],
            balance: after,
            peer: null,
            memo,
          }
        }),
        skipped: {},
        unknown: {},
      }
    },
  }
}

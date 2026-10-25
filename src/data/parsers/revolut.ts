import type { Kind } from '../schema'
import {
  cells,
  chain,
  heading,
  instant,
  keyed,
  type Leg,
  type Parser,
  reader,
  type Skip,
} from '../statement'

const header =
  'type,product,started date,completed date,description,amount,fee,currency,state,balance'
const clock = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/
const kinds: Record<string, Kind> = {
  'card payment': 'transfer',
  'card refund': 'transfer',
  charge: 'transfer',
  deposit: 'transfer',
  exchange: 'trade',
  'rev payment': 'transfer',
  transfer: 'transfer',
}
const skips: Record<string, Skip> = { PENDING: 'pending', REVERTED: 'reverted' }

export const revolut: Parser = {
  id: 'revolut',
  name: 'Revolut',
  detect: (text) => heading(text, ',') === header,
  parse(text) {
    const skipped: Partial<Record<Skip, number>> = {}
    const unknown: Record<string, number> = {}
    const booked = cells(text, ',')
      .slice(1)
      .flatMap((line, index) => {
        const [
          type = '',
          label = '',
          ,
          completed = '',
          description = '',
          amount = '',
          fee = '',
          currency = '',
          state = '',
          balance = '',
        ] = line
        const { fail, units } = reader(index + 2)
        const skip = skips[state]
        if (skip) {
          skipped[skip] = (skipped[skip] ?? 0) + 1
          return []
        }
        if (state !== 'COMPLETED') throw fail('the state is not known')
        const parts = clock.exec(completed)?.slice(1).map(Number)
        if (!parts) throw fail('the completed date is unreadable')
        const moved = units(amount, 'amount')
        const charged = units(fee, 'fee')
        const after = units(balance, 'balance')
        const kind = kinds[type.toLowerCase()]
        if (!kind) unknown[type] = (unknown[type] ?? 0) + 1
        const legs: Leg[] = [
          { leg: 'amount', kind: kind ?? 'transfer', amount: moved },
          { leg: 'fee', kind: charged > 0n ? 'fee' : 'transfer', amount: -charged },
        ]
        const memo = description.trim() || null
        const kept = legs.filter(({ amount }) => amount)
        return [{ label, currency, ...instant(parts), moved, charged, after, legs: kept, memo }]
      })
    const ordered = chain(booked, ({ label, currency, moved, charged, after }) => ({
      series: `${label} ${currency}`,
      delta: moved - charged,
      balance: after,
    }))
    const key = keyed()
    return {
      rows: ordered.map(({ label, currency, stamp, time, moved, after, legs, memo }) => ({
        label,
        unit: { fiat: currency },
        time,
        ref: key({ label, stamp, unit: currency, amount: moved }),
        legs,
        balance: after,
        peer: null,
        memo,
      })),
      skipped,
      unknown,
    }
  },
}

import { z } from '../core/zod.ts'
import type { Fetch } from './host.ts'
import type { Day } from './schema.ts'

const Latest = z.object({ date: z.iso.date(), rates: z.object({ USD: z.number().positive() }) })

const Series = z.object({ rates: z.record(z.string(), z.object({ USD: z.number().positive() })) })

export async function usdPer(fetch: Fetch, currency: string, today: Day): Promise<[Day, number]> {
  if (currency === 'USD') return [today, 1]
  const path = `/latest?base=${currency}&symbols=USD` as const
  const { date, rates } = Latest.parse(await fetch('frankfurter', path))
  return [date as Day, rates.USD]
}

export async function usdPerDay(
  fetch: Fetch,
  currency: string,
  from: Day,
  to: Day,
): Promise<[Day, number][]> {
  if (currency === 'USD') return [[from, 1]]
  const path = `/${from}..${to}?base=${currency}&symbols=USD` as const
  const { rates } = Series.parse(await fetch('frankfurter', path))
  return Object.entries(rates)
    .map(([day, { USD }]): [Day, number] => [day as Day, USD])
    .toSorted(([a], [b]) => a.localeCompare(b))
}

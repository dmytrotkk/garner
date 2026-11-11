import { parseUnits } from 'viem'
import { date, dayMonth, month, monthShort } from '../core/format.ts'
import { plain, words } from '../core/search.ts'
import type { Movement } from './ledger.ts'
import { type CategoryType, type Day, dayOf } from './schema.ts'
import { internal, spends } from './spending.ts'

export type Flag = 'spent' | 'received' | 'uncategorized'
export type Figure = { value: bigint; places: number }
export type Period = { from: Day; to: Day }
export type Facet =
  | ({ kind: 'period' } & Period)
  | { kind: 'amount'; value: Figure }
  | { kind: 'range'; from: Figure; to: Figure }
  | { kind: 'over' | 'under'; value: Figure }
  | { kind: 'flag'; flag: Flag }
export type Query = { words: readonly string[]; facets: readonly Facet[] }

type Span =
  | { kind: 'facet'; facet: Facet; tokens: readonly string[] }
  | { kind: 'stop' | 'word' | 'quoted'; tokens: readonly string[] }
type Reading = { at: (year: number) => Period | undefined; year: number | undefined }
type Read<Value> = { value: Value; next: number } | undefined
type Context = { today: Day; year: number; lower: readonly string[] }

const stops = new Set(
  'a all an and at by did do for from how i in is matching me movements much my of on show the to was what were with'.split(
    ' ',
  ),
)
const flagWords: Record<string, Flag> = {
  spent: 'spent',
  spend: 'spent',
  spending: 'spent',
  received: 'received',
  uncategorized: 'uncategorized',
  uncategorised: 'uncategorized',
}
const flagOrder: readonly Flag[] = ['spent', 'received', 'uncategorized']
const comparators: Record<string, 'over' | 'under'> = {
  over: 'over',
  above: 'over',
  'more than': 'over',
  under: 'under',
  below: 'under',
  'less than': 'under',
}
const names = Array.from({ length: 12 }, (_, at) => plain(monthShort(Date.UTC(2000, at))))
const fullNames = Array.from({ length: 12 }, (_, at) =>
  plain(month(Date.UTC(2000, at))).replace(' 2000', ''),
)
const units = ['day', 'week', 'month', 'quarter', 'year'] as const
type Unit = (typeof units)[number]
const binders = new Set(['to', 'since', 'between', 'and'])

const dayAt = (year: number, monthIndex: number, day: number) =>
  dayOf(Date.UTC(year, monthIndex, day))
const parts = (day: Day) => day.split('-').map(Number) as [number, number, number]
const timeOf = (day: Day) => Date.parse(day)
const span = (from: Day, to: Day): Period => ({ from, to })
const fixed = (period: Period): Reading => ({
  at: () => period,
  year: parts(period.from)[0],
})
const calendarMonth = (year: number, index: number) =>
  span(dayAt(year, index, 1), dayAt(year, index + 1, 0))

function figure(text: string | undefined): Figure | undefined {
  if (!text || !/^\d+(?:[.,]\d+)*$/.test(text) || /^0\d/.test(text)) return undefined
  const separators = text.replace(/\d/g, '')
  const grouping =
    separators.length > 1 ? new Set(separators).size === 1 : /^[1-9]\d{0,2}[.,]\d{3}$/.test(text)
  const cut = grouping || !separators ? text.length : text.search(/[.,]\d+$/)
  const fraction = text.slice(cut + 1)
  if (fraction.length > 18) return undefined
  const whole = text.slice(0, cut).replace(/[.,]/g, '')
  return {
    value: parseUnits(fraction ? `${whole}.${fraction}` : whole, 18),
    places: fraction.length,
  }
}

const yearOf = (text: string | undefined, { year }: Context) => {
  const value = Number(text)
  return text && /^\d{4}$/.test(text) && value >= 2000 && value <= year ? value : undefined
}

const latest = (reading: Reading, { today, year }: Context) => {
  for (let at = year; at > year - 8; at--) {
    const period = reading.at(at)
    if (period && period.from <= today) return period
  }
  return undefined
}

const resolve = (reading: Reading, context: Context) =>
  reading.year === undefined ? latest(reading, context) : reading.at(reading.year)

const ordered = (from: Period | undefined, to: Period | undefined) =>
  from && to && from.from <= to.to ? span(from.from, to.to) : undefined

function joined(a: Reading, b: Reading, context: Context) {
  if (a.year !== undefined && b.year !== undefined) return ordered(a.at(a.year), b.at(b.year))
  if (b.year !== undefined)
    return ordered(a.at(b.year), b.at(b.year)) ?? ordered(a.at(b.year - 1), b.at(b.year))
  const start = resolve(a, context)
  if (!start) return undefined
  const [year] = parts(start.from)
  return ordered(start, b.at(year)) ?? ordered(start, b.at(year + 1))
}

function calendar(unit: Exclude<Unit, 'day'>, back: number, { today }: Context) {
  const [year, number, day] = parts(today)
  const index = number - 1
  if (unit === 'week') {
    const monday = day - ((new Date(Date.UTC(year, index, day)).getUTCDay() + 6) % 7) - 7 * back
    return span(dayAt(year, index, monday), dayAt(year, index, monday + 6))
  }
  if (unit === 'month') return calendarMonth(year, index - back)
  if (unit === 'quarter') {
    const first = Math.floor(index / 3) * 3 - 3 * back
    return span(dayAt(year, first, 1), dayAt(year, first + 3, 0))
  }
  return span(dayAt(year - back, 0, 1), dayAt(year - back, 11, 31))
}

function rolling(unit: Unit, count: number, { today }: Context) {
  const [year, number, day] = parts(today)
  const index = number - 1
  if (unit === 'day' || unit === 'week')
    return span(dayAt(year, index, day - (unit === 'day' ? count : 7 * count) + 1), today)
  if (unit === 'month') return span(dayAt(year, index - count + 1, 1), dayAt(year, index + 1, 0))
  if (unit === 'year') return span(dayAt(year - count + 1, 0, 1), dayAt(year, 11, 31))
  return undefined
}

const unitOf = (text: string | undefined) =>
  units.find((unit) => text === unit || text === `${unit}s`)

function monthIndex(at: number, { lower }: Context) {
  const text = lower[at] ?? ''
  const full = fullNames.indexOf(text)
  if (full >= 0) return full
  const short = text === 'sept' ? 8 : names.indexOf(text)
  if (short < 0) return undefined
  const [before = '', after = ''] = [lower[at - 1], lower[at + 1]]
  const near = /^\d/.test(before) || /^\d/.test(after) || binders.has(before) || after === 'to'
  return near ? short : undefined
}

function period(at: number, context: Context): Read<Reading> {
  const { lower, today } = context
  const text = lower[at] ?? ''
  if (text === 'today') return { value: fixed(span(today, today)), next: at + 1 }
  if (text === 'yesterday') {
    const [y, m, d] = parts(today)
    const day = dayAt(y, m - 1, d - 1)
    return { value: fixed(span(day, day)), next: at + 1 }
  }
  const unit = unitOf(lower[at + 1])
  if ((text === 'this' || text === 'last') && unit && unit !== 'day')
    return { value: fixed(calendar(unit, text === 'last' ? 1 : 0, context)), next: at + 2 }
  const count = Number(lower[at + 1])
  const rolled = unitOf(lower[at + 2])
  const window =
    (text === 'last' || text === 'past') &&
    /^[1-9]\d{0,3}$/.test(lower[at + 1] ?? '') &&
    rolled &&
    rolling(rolled, count, context)
  if (window) return { value: fixed(window), next: at + 3 }
  const quarter = /^q([1-4])$/.exec(text)
  if (quarter) {
    const first = (Number(quarter[1]) - 1) * 3
    const explicit = yearOf(lower[at + 1], context)
    return {
      value: {
        at: (y) => span(dayAt(y, first, 1), dayAt(y, first + 3, 0)),
        year: explicit,
      },
      next: explicit ? at + 2 : at + 1,
    }
  }
  const index = monthIndex(at, context)
  if (index !== undefined) {
    const explicit = yearOf(lower[at + 1], context)
    if (explicit)
      return { value: { at: (y) => calendarMonth(y, index), year: explicit }, next: at + 2 }
    const number = lower[at + 1] ?? ''
    if (/^\d{1,2}$/.test(number)) {
      const day = Number(number)
      const after = yearOf(lower[at + 2], context)
      const reading: Reading = {
        at: (y) => {
          const found = dayAt(y, index, day)
          return parts(found)[1] === index + 1 ? span(found, found) : undefined
        },
        year: after,
      }
      if (resolve(reading, context)) return { value: reading, next: after ? at + 3 : at + 2 }
    }
    return { value: { at: (y) => calendarMonth(y, index), year: undefined }, next: at + 1 }
  }
  const whole = yearOf(text, context)
  return whole === undefined
    ? undefined
    : { value: fixed(span(dayAt(whole, 0, 1), dayAt(whole, 11, 31))), next: at + 1 }
}

function facetAt(at: number, context: Context): Read<Facet> {
  const { lower, today } = context
  const text = lower[at] ?? ''
  const asPeriod = (found: Period | undefined, next: number): Read<Facet> =>
    found && { value: { kind: 'period', ...found }, next }
  const ranged = (start: number, binder: string): Read<Facet> => {
    const a = period(start, context)
    const b = a && lower[a.next] === binder ? period(a.next + 1, context) : undefined
    if (a && b) {
      const found = asPeriod(joined(a.value, b.value, context), b.next)
      if (found) return found
    }
    const from = figure(lower[start])
    const to = lower[start + 1] === binder ? figure(lower[start + 2]) : undefined
    return from && to ? { value: { kind: 'range', from, to }, next: start + 3 } : undefined
  }
  if (text === 'between') {
    const found = ranged(at + 1, 'and')
    if (found) return found
  }
  if (text === 'since') {
    const found = period(at + 1, context)
    const start = found && resolve(found.value, context)
    if (found && start) return asPeriod(span(start.from, today), found.next)
  }
  const pair = `${text} ${lower[at + 1]}`
  const [kind, after] = comparators[pair]
    ? [comparators[pair], at + 2]
    : [comparators[text], at + 1]
  const compared = kind && figure(lower[after])
  if (kind && compared) return { value: { kind, value: compared }, next: after + 1 }
  const range = ranged(at, 'to')
  if (range) return range
  const found = period(at, context)
  if (found) {
    const value = resolve(found.value, context)
    if (value) return asPeriod(value, found.next)
  }
  const value = figure(text)
  if (value) return { value: { kind: 'amount', value }, next: at + 1 }
  const flag = flagWords[text]
  return flag && { value: { kind: 'flag', flag }, next: at + 1 }
}

function read(input: string, today: Day): Span[] {
  const year = parts(today)[0]
  return input
    .replace(/[“-‟«»″]/g, '"')
    .split('"')
    .flatMap((segment, index): Span[] => {
      if (index % 2) return [{ kind: 'quoted', tokens: words(segment) }]
      const typed = words(segment.replace(/(\d)\s*[-‐-―−]\s*(?=\d)/g, '$1 to '))
      const context: Context = { today, year, lower: typed.map(plain) }
      const spans: Span[] = []
      for (let at = 0; at < typed.length; ) {
        const found = facetAt(at, context)
        const next = found?.next ?? at + 1
        const tokens = typed.slice(at, next)
        spans.push(
          found
            ? { kind: 'facet', facet: found.value, tokens }
            : { kind: stops.has(context.lower[at] ?? '') ? 'stop' : 'word', tokens },
        )
        at = next
      }
      return spans
    })
    .filter(({ tokens }) => tokens.length > 0)
}

export function parse(input: string, today: Day): Query {
  const spans = read(input, today)
  return {
    words: spans.flatMap((span) =>
      span.kind === 'word' || span.kind === 'quoted' ? span.tokens : [],
    ),
    facets: spans.flatMap((span) => (span.kind === 'facet' ? [span.facet] : [])),
  }
}

const alone = (span: Span) => span.kind === 'facet' && span.tokens.length === 1

export function literal(input: string, today: Day) {
  const spans = read(input, today)
  if (!spans.some(alone)) return undefined
  return spans
    .map((span) =>
      span.kind === 'quoted' || alone(span) ? `"${span.tokens.join(' ')}"` : span.tokens.join(' '),
    )
    .join(' ')
}

export function named({ from, to }: Period) {
  const [fromYear, fromMonth, fromDay] = parts(from)
  const [toYear, toMonth] = parts(to)
  if (from === to) return date(timeOf(from))
  if (fromDay !== 1 || to !== dayAt(toYear, toMonth, 0))
    return fromYear === toYear
      ? `${dayMonth(timeOf(from))} to ${date(timeOf(to))}`
      : `${date(timeOf(from))} to ${date(timeOf(to))}`
  if (fromMonth === 1 && toMonth === 12)
    return fromYear === toYear ? `${fromYear}` : `${fromYear} to ${toYear}`
  if (fromYear !== toYear)
    return `${monthShort(timeOf(from))} ${fromYear} to ${monthShort(timeOf(to))} ${toYear}`
  if (fromMonth === toMonth) return month(timeOf(from))
  if (fromMonth % 3 === 1 && toMonth === fromMonth + 2) return `Q${(fromMonth + 2) / 3} ${fromYear}`
  return `${monthShort(timeOf(from))} to ${monthShort(timeOf(to))} ${toYear}`
}

const grouped = new Intl.NumberFormat('en-US')
const scale = 10n ** 18n

const shown = ({ value, places }: Figure) =>
  places
    ? `${grouped.format(value / scale)}.${(value % scale).toString().padStart(18, '0').slice(0, places)}`
    : grouped.format(value / scale)

export function reading({ words: typed, facets }: Query) {
  const flags = flagOrder.filter((flag) =>
    facets.some((facet) => facet.kind === 'flag' && facet.flag === flag),
  )
  const subject = flags.join(' and ')
  const of = flags.length ? '' : 'of '
  const amounts = facets.flatMap((facet) =>
    facet.kind === 'amount'
      ? [`${of}${shown(facet.value)}`]
      : facet.kind === 'range'
        ? [`${of}${shown(facet.from)} to ${shown(facet.to)}`]
        : facet.kind === 'over' || facet.kind === 'under'
          ? [`${facet.kind} ${shown(facet.value)}`]
          : [],
  )
  const periods = facets.flatMap((facet) => {
    if (facet.kind !== 'period') return []
    const name = named(facet)
    return [`${facet.from === facet.to ? 'on' : name.includes(' to ') ? 'from' : 'in'} ${name}`]
  })
  return [
    subject ? subject.charAt(0).toUpperCase() + subject.slice(1) : 'Movements',
    typed.length ? `matching "${typed.join(' ')}"` : '',
    amounts.join(' and '),
    periods.join(' and '),
  ]
    .filter(Boolean)
    .join(' ')
}

const size = ({ quantity }: Movement) => (quantity < 0n ? -quantity : quantity)

const flagged: Record<Flag, (row: Movement, type: CategoryType | undefined) => boolean> = {
  spent: spends,
  received: (row, type) => row.kind !== 'trade' && !internal(row, type) && row.quantity > 0n,
  uncategorized: (row) => row.kind !== 'trade' && row.assignment.state === 'open',
}

export function holds(
  facets: readonly Facet[],
  typeOf: (row: Movement) => CategoryType | undefined,
) {
  const test = (facet: Facet): ((row: Movement) => boolean) => {
    switch (facet.kind) {
      case 'period': {
        const [from, to] = [timeOf(facet.from), timeOf(facet.to) + 86_400_000]
        return ({ time }) => time >= from && time < to
      }
      case 'amount': {
        const { value, places } = facet.value
        const end = value + 10n ** BigInt(18 - places)
        return (row) => size(row) >= value && size(row) < end
      }
      case 'range':
        return (row) => size(row) >= facet.from.value && size(row) <= facet.to.value
      case 'over':
        return (row) => size(row) > facet.value.value
      case 'under':
        return (row) => size(row) < facet.value.value
    }
    return (row) => flagged[facet.flag](row, typeOf(row))
  }
  const tests = facets.map(test)
  return (row: Movement) => tests.every((each) => each(row))
}

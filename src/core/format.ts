export type MoneyFormat = 'full' | 'compact' | 'price'

const styles = {
  full: {},
  compact: { notation: 'compact', maximumFractionDigits: 1 },
  cents: { maximumSignificantDigits: 4 },
} as const satisfies Record<string, Intl.NumberFormatOptions>

const formatters = new Map<string, Intl.NumberFormat>()
const counts = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 })
const shares = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })

const days = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

export const dash = '-'

export const date = (time: number) => days.format(time)

const months = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export const month = (time: number) => months.format(time)

const shortDays = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export const dayMonth = (time: number) => shortDays.format(time)

export const day = (time: number) =>
  new Date(time).getUTCFullYear() === new Date().getUTCFullYear() ? dayMonth(time) : date(time)

const shortMonths = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

const moments = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

export const moment = (time: number) => `${moments.format(time)} UTC`

export const timed = (time: number) => {
  const clock = time % 86_400_000
  return clock < 43_200_000 || clock >= 43_201_000
}

export const monthShort = (time: number) => shortMonths.format(time)

const iso = new Intl.DateTimeFormat('en-CA')

export const local = (time: number) => iso.format(time)

export function money(value: number, currency: string, format: MoneyFormat = 'full'): string {
  const style = format === 'price' ? (value < 1 ? 'cents' : 'full') : format
  const key = `${currency} ${style}`
  const formatter =
    formatters.get(key) ??
    new Intl.NumberFormat('en-US', { style: 'currency', currency, ...styles[style] })
  formatters.set(key, formatter)
  return formatter.format(value)
}

export function tick(value: number, step: number, currency: string) {
  const power = Math.min(4, Math.max(0, Math.floor(Math.log10(Math.abs(value)) / 3)))
  const digits = Math.ceil(3 * power - Math.log10(step))
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: Math.min(3 * power + 2, Math.max(1, digits)),
  }).format(value)
}

export const quantity = (value: number) => counts.format(value)

export const plural = (count: number, noun: string, many = `${noun}s`) =>
  `${quantity(count)} ${count === 1 ? noun : many}`

export const percent = (value: number) => shares.format(value)

export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

export const units = (quantity: bigint, decimals: number) => Number(quantity) / 10 ** decimals

const minor = new Set(
  'a an and as at but by for from in into nor of on onto or per so the to via with yet'.split(' '),
)

export const title = (label: string) =>
  label
    .split(' ')
    .map((word, index, words) =>
      index > 0 && index < words.length - 1 && minor.has(word)
        ? word
        : `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join(' ')

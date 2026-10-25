import { dash, type MoneyFormat, money, quantity, tick, units } from '../core/format'
import { type AssetId, scale } from '../data/schema'
import type { Currency } from '../data/settings'
import { Mask } from '../ui/mask'
import { root } from './-data'

type Sum = { amount: number; currency: Currency }

type MoneyProps = { value: number | Sum | null; format?: MoneyFormat }

export function Money({ value, format }: MoneyProps) {
  const { display, privacy } = root.useLoaderData()
  if (value === null) return dash
  if (privacy && format !== 'price') return <Mask />
  const { amount, currency } =
    typeof value === 'number' ? { amount: value, currency: 'USD' } : value
  const shown = currency === 'USD' ? amount * display.rate : amount
  return money(shown, display.currency, format)
}

export function useScale(currency: Currency) {
  const { display, privacy } = root.useLoaderData()
  if (privacy) return undefined
  const rate = currency === 'USD' ? display.rate : 1
  return (amount: number, step: number) => tick(amount * rate, step * rate, display.currency)
}

export function useCompact(currency: Currency) {
  const { display, privacy } = root.useLoaderData()
  if (privacy) return undefined
  const rate = currency === 'USD' ? display.rate : 1
  return (amount: number) => money(amount * rate, display.currency, 'compact')
}

export const code = (id: AssetId) => id.slice('fiat:'.length)

export const sum = (id: AssetId, quantity: bigint) => (
  <Amount value={units(quantity, scale)} id={id} />
)

type AmountProps = { value: number; id?: AssetId; symbol?: string }

export function Amount({ value, id, symbol }: AmountProps) {
  const { privacy } = root.useLoaderData()
  if (privacy) return <Mask />
  if (id?.startsWith('fiat:')) return money(value, code(id))
  return symbol ? `${quantity(value)} ${symbol}` : quantity(value)
}

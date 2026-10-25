import { formatUnits, parseUnits } from 'viem'
import { type Kind, scale } from './schema'
import { xls } from './xls'
import { xlsx } from './xlsx'

export type Doc = { name: string; text: string }
type Unit = { fiat: string } | { ticker: string }
export type Leg = { leg: string; kind: Kind; amount: bigint }
export type Row = {
  label: string
  unit: Unit
  time: number
  ref: string
  legs: readonly Leg[]
  balance: bigint | null
  peer: string | null
  memo: string | null
}
export type Skip = 'pending' | 'reverted'
export type Statement = {
  rows: readonly Row[]
  skipped: Readonly<Partial<Record<Skip, number>>>
  unknown: Readonly<Record<string, number>>
}
export type Parser = {
  id: string
  name: string
  detect: (text: string) => boolean
  parse: (text: string) => Statement
}

const utf8 = new TextDecoder('utf-8', { fatal: true })
const latin = new TextDecoder('windows-1252')

const ole = '0M8R4KGxGuE'
const zip = 'UEsDB'

export function open(name: string, bytes: Uint8Array): Doc {
  const head = bytes.subarray(0, 8).toBase64()
  if (head.startsWith(ole) || head.startsWith(zip)) return { name, text: bytes.toBase64() }
  try {
    return { name, text: utf8.decode(bytes) }
  } catch {
    return { name, text: latin.decode(bytes) }
  }
}

const field = (cell: string) => (/[\t\n\r"]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell)

const table = (rows: readonly (readonly string[])[]) =>
  rows.map((row) => row.map(field).join('\t')).join('\n')

export const view = (text: string) =>
  text.startsWith(ole)
    ? table(xls(Uint8Array.fromBase64(text)))
    : text.startsWith(zip)
      ? table(xlsx(Uint8Array.fromBase64(text)))
      : text

export function cells(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const close = () => {
    row.push(cell)
    cell = ''
  }
  for (let at = text.charCodeAt(0) === 0xfeff ? 1 : 0; at < text.length; at++) {
    const char = text.charAt(at)
    if (quoted) {
      if (char !== '"') cell += char
      else if (text.charAt(at + 1) === '"') {
        cell += char
        at++
      } else quoted = false
    } else if (char === '"') quoted = true
    else if (char === delimiter) close()
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text.charAt(at + 1) === '\n') at++
      close()
      rows.push(row)
      row = []
    } else cell += char
  }
  if (cell || row.length) {
    close()
    rows.push(row)
  }
  return rows.filter((line) => line.some(Boolean))
}

export const heading = (text: string, delimiter: string) =>
  (cells(text.slice(0, text.indexOf('\n') + 1), delimiter)[0] ?? [])
    .map((cell) => cell.trim().toLowerCase())
    .join(delimiter)

export function reader(row: number) {
  const fail = (reason: string) => new Error(`Row ${row}: ${reason}.`)
  const units = (cell: string, name: string) => {
    try {
      return parseUnits(cell, scale)
    } catch {
      throw fail(`the ${name} is unreadable`)
    }
  }
  return { fail, units }
}

type Link = { series: string; delta: bigint; balance: bigint }

export function chain<Item>(items: readonly Item[], of: (item: Item) => Link): Item[] {
  const breaks = (ordered: readonly Item[]) =>
    ordered.filter((item, index) => {
      const before = ordered[index - 1]
      const { delta, balance } = of(item)
      return before !== undefined && of(before).balance + delta !== balance
    }).length
  return [...Map.groupBy(items, (item) => of(item).series)].flatMap(([series, forward]) => {
    const backward = forward.toReversed()
    const [ahead, behind] = [breaks(forward), breaks(backward)]
    if (Math.min(ahead, behind) * 2 > forward.length - 1)
      throw new Error(`The balance of ${series} does not follow its rows.`)
    return ahead <= behind ? forward : backward
  })
}

export function instant(parts: readonly number[]) {
  const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = parts
  return {
    stamp: parts.map((part, index) => String(part).padStart(index ? 2 : 4, '0')).join(''),
    time: Date.UTC(year, month - 1, day, hour, minute, second),
  }
}

type Stamped = { label: string; stamp: string; unit: string; amount: bigint }

export function keyed() {
  const seen = new Map<string, number>()
  return ({ label, stamp, unit, amount }: Stamped) => {
    const row = `${stamp}:${unit}:${formatUnits(amount, scale)}`
    const twins = seen.get(`${label}:${row}`) ?? 0
    seen.set(`${label}:${row}`, twins + 1)
    return `row:${row}:${twins}`
  }
}

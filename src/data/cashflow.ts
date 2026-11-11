import type { Movement } from './ledger.ts'
import { monthOf } from './schema.ts'
import { type Valuation, valuer } from './spending.ts'

export type Month = `${number}-${number}`

export type Grain = 'month' | 'quarter' | 'year'

export type Range = { from: Month; to: Month }

export type Scope =
  | { kind: 'all' }
  | { kind: 'institution'; institutionId: string }
  | { kind: 'account'; accountId: string }

export type Ref =
  | { kind: 'category'; categoryId: string }
  | { kind: 'merchant'; merchantId: string; categoryId: string }
  | { kind: 'account'; accountId: string }
  | { kind: 'institution'; institutionId: string }
  | { kind: 'none' }
  | { kind: 'other'; folded: readonly Fold[] }
  | { kind: 'kept' }
  | { kind: 'balance' }

export type Fold = { ref: Ref; value: number }

export type Edge = { from: string; to: string; value: number }

export type Node = { id: string; ref: Ref }

export type Cashflow = { nodes: readonly Node[]; edges: readonly Edge[]; unpriced: number }

type Side = 'in' | 'out'

const cent = 0.005

const spans: Record<Grain, number> = { month: 1, quarter: 3, year: 12 }

const parse = (month: Month) => {
  const [year = 0, index = 1] = month.split('-').map(Number)
  return year * 12 + index - 1
}

const make = (months: number): Month =>
  `${Math.floor(months / 12)}-${String((months % 12) + 1).padStart(2, '0')}` as Month

export const monthAt = (time: number) => monthOf(time) as Month

export const period = (grain: Grain, at: Month): Range => {
  const span = spans[grain]
  const start = Math.floor(parse(at) / span) * span
  return { from: make(start), to: make(start + span - 1) }
}

export const trailing = (count: number, to: Month): Range => ({
  from: make(parse(to) - count + 1),
  to,
})

export const length = ({ from, to }: Range) => parse(to) - parse(from) + 1

export const shift = (range: Range, by: 1 | -1): Range => {
  const step = length(range) * by
  return { from: make(parse(range.from) + step), to: make(parse(range.to) + step) }
}

export const grainOf = (range: Range): Grain | undefined =>
  (Object.keys(spans) as Grain[]).find((grain) => {
    const { from, to } = period(grain, range.from)
    return from === range.from && to === range.to
  })

export const within = ({ from, to }: Range, time: number) => {
  const month = monthAt(time)
  return month >= from && month <= to
}

export const latest = (rows: readonly Movement[]) =>
  rows.length ? monthAt(Math.max(...rows.map(({ time }) => time))) : undefined

const leaf = (side: Side, ref: Ref) =>
  `${side}:${
    ref.kind === 'category'
      ? `category:${ref.categoryId}`
      : ref.kind === 'merchant'
        ? `merchant:${ref.merchantId}`
        : ref.kind === 'account'
          ? `account:${ref.accountId}`
          : ref.kind === 'institution'
            ? `institution:${ref.institutionId}`
            : ref.kind
  }`

export function cashflow(
  rows: readonly Movement[],
  range: Range,
  scope: Scope,
  owners: ReadonlyMap<string, string>,
  context: Valuation,
  limit = 10,
): Cashflow {
  const refs = new Map<string, Ref>()
  const edges = new Map<string, number>()
  const inside = (accountId: string) =>
    scope.kind === 'all'
      ? owners.has(accountId)
      : scope.kind === 'institution'
        ? owners.get(accountId) === scope.institutionId
        : accountId === scope.accountId
  const nodeOf = (accountId: string) => {
    const ref: Ref =
      scope.kind === 'account'
        ? { kind: 'account', accountId }
        : { kind: 'institution', institutionId: owners.get(accountId) ?? '' }
    const id = ref.kind === 'account' ? `account:${accountId}` : `institution:${ref.institutionId}`
    refs.set(id, ref)
    return id
  }
  const end = (side: Side, ref: Ref) => {
    const id = leaf(side, ref)
    refs.set(id, ref)
    return id
  }
  const add = (from: string, to: string, value: number) => {
    if (value > 0) edges.set(`${from}|${to}`, (edges.get(`${from}|${to}`) ?? 0) + value)
  }
  const peerEnd = (side: Side, accountId: string) =>
    inside(accountId)
      ? nodeOf(accountId)
      : end(
          side,
          scope.kind === 'account'
            ? { kind: 'account', accountId }
            : { kind: 'institution', institutionId: owners.get(accountId) ?? '' },
        )
  const worth = valuer(context)
  const tally = new Map<string, number>()
  let unpriced = 0
  const kept = rows
    .filter((row) => within(range, row.time) && inside(row.accountId))
    .toSorted((a, b) => a.time - b.time)
  for (const row of kept) {
    if (row.kind === 'trade') continue
    const priced = worth(row.assetId, row.time)
    const value = priced(row.quantity)
    if (value === undefined) {
      unpriced++
      continue
    }
    const node = nodeOf(row.accountId)
    const fee = row.kind === 'transfer' ? row.fee : 0n
    const feeOut = () => {
      if (fee < 0n) add(node, end('out', { kind: 'none' }), priced(-fee) ?? 0)
    }
    if (row.kind === 'transfer' && row.transfer.state === 'paired') {
      const { transfer } = row
      const peer = transfer.with.accountId
      if (row.quantity < 0n) {
        const target = peerEnd('out', peer)
        if (target !== node) add(node, target, priced(transfer.received) ?? 0)
        const hidden = transfer.sent - transfer.received - fee
        if (hidden > 0n) add(node, end('out', { kind: 'none' }), priced(hidden) ?? 0)
      } else {
        if (!inside(peer)) add(peerEnd('in', peer), node, priced(transfer.received) ?? 0)
        feeOut()
      }
      continue
    }
    const { assignment } = row
    const type = 'categoryId' in assignment ? context.types.get(assignment.categoryId) : undefined
    if (type === 'transfer' && 'categoryId' in assignment) {
      const amount = row.quantity - fee
      const ref: Ref =
        row.identity.state === 'linked'
          ? {
              kind: 'merchant',
              merchantId: row.identity.merchantId,
              categoryId: assignment.categoryId,
            }
          : { kind: 'category', categoryId: assignment.categoryId }
      if (amount > 0n) add(end('in', ref), node, priced(amount) ?? 0)
      else if (amount < 0n) add(node, end('out', ref), priced(-amount) ?? 0)
      feeOut()
      continue
    }
    if ((type === 'expense' || type === 'income') && 'categoryId' in assignment) {
      const key = `${node}|${assignment.categoryId}`
      tally.set(key, (tally.get(key) ?? 0) + value)
      continue
    }
    if (value > 0) add(end('in', { kind: 'none' }), node, value)
    else add(node, end('out', { kind: 'none' }), -value)
  }
  for (const [key, net] of tally) {
    const [node = '', categoryId = ''] = key.split('|')
    const ref: Ref = { kind: 'category', categoryId }
    if (net > 0) add(end('in', ref), node, net)
    else if (net < 0) add(node, end('out', ref), -net)
  }
  const isNode = (id: string) => !id.includes(':') || !/^(in|out):/.test(id)
  for (const [key, value] of [...edges]) {
    const [from = '', to = ''] = key.split('|')
    const back = edges.get(`${to}|${from}`)
    if (!isNode(from) || !isNode(to) || back === undefined || !edges.has(key)) continue
    edges.delete(key)
    edges.delete(`${to}|${from}`)
    if (value > back) edges.set(key, value - back)
    else if (back > value) edges.set(`${to}|${from}`, back - value)
  }
  const acyclic = () => {
    const ids = [...refs.keys()].filter(isNode)
    const left = new Map(ids.map((id) => [id, 0]))
    const inner = [...edges.keys()]
      .map((key) => key.split('|'))
      .filter(([from = '', to = '']) => isNode(from) && isNode(to))
    for (const [, to = ''] of inner) left.set(to, (left.get(to) ?? 0) + 1)
    const queue = ids.filter((id) => !left.get(id))
    for (let at = 0; at < queue.length; at++) {
      for (const [from = '', to = ''] of inner) {
        if (from !== queue[at]) continue
        left.set(to, (left.get(to) ?? 1) - 1)
        if (left.get(to) === 0) queue.push(to)
      }
    }
    return inner.filter(([from = '', to = '']) => !queue.includes(from) || !queue.includes(to))
  }
  for (let cyclic = acyclic(); cyclic.length; cyclic = acyclic()) {
    const [from = '', to = ''] = cyclic.toSorted(
      (a, b) => (edges.get(a.join('|')) ?? 0) - (edges.get(b.join('|')) ?? 0),
    )[0] ?? ['', '']
    const value = edges.get(`${from}|${to}`) ?? 0
    edges.delete(`${from}|${to}`)
    const target = refs.get(to)
    const source = refs.get(from)
    if (target) add(from, end('out', target), value)
    if (source) add(end('in', source), to, value)
  }
  const flow = (id: string, side: Side) =>
    [...edges].reduce(
      (sum, [key, value]) => sum + (key.split('|')[side === 'in' ? 1 : 0] === id ? value : 0),
      0,
    )
  for (const id of [...refs.keys()].filter(isNode)) {
    const into = flow(id, 'in')
    const out = flow(id, 'out')
    if (scope.kind === 'all' && out === 0) continue
    if (into - out > cent) add(id, end('out', { kind: 'kept' }), into - out)
    else if (out - into > cent) add(end('in', { kind: 'balance' }), id, out - into)
  }
  for (const side of ['in', 'out'] as const) {
    const named = [...refs]
      .filter(
        ([id, ref]) =>
          id.startsWith(`${side}:`) && (ref.kind === 'category' || ref.kind === 'merchant'),
      )
      .map(([id, ref]) => ({ id, ref, value: flow(id, side === 'in' ? 'out' : 'in') }))
      .toSorted((a, b) => b.value - a.value)
    const folded = named.slice(limit)
    if (folded.length < 2) continue
    const other = end(side, {
      kind: 'other',
      folded: folded.map(({ ref, value }) => ({ ref, value })),
    })
    for (const { id } of folded) {
      for (const [key, value] of [...edges]) {
        const [from = '', to = ''] = key.split('|')
        if (from !== id && to !== id) continue
        edges.delete(key)
        add(from === id ? other : from, to === id ? other : to, value)
      }
      refs.delete(id)
    }
  }
  const list = [...edges]
    .map(([key, value]) => {
      const [from = '', to = ''] = key.split('|')
      return { from, to, value }
    })
    .filter(({ value }) => value >= cent)
    .toSorted((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
  const used = new Set(list.flatMap(({ from, to }) => [from, to]))
  const weight = (id: string) => flow(id, 'in') + flow(id, 'out')
  const rank = (ref: Ref) =>
    ref.kind === 'category'
      ? 0
      : ref.kind === 'none'
        ? 2
        : ref.kind === 'other'
          ? 3
          : ref.kind === 'kept' || ref.kind === 'balance'
            ? 4
            : 1
  const nodes = [...refs]
    .filter(([id]) => used.has(id))
    .map(([id, ref]) => ({ id, ref }))
    .toSorted(
      (a, b) =>
        Number(isNode(b.id)) - Number(isNode(a.id)) ||
        rank(a.ref) - rank(b.ref) ||
        weight(b.id) - weight(a.id),
    )
  return { nodes, edges: list, unpriced }
}

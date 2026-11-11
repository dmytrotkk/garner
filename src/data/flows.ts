import type { Assignment, Movement, MovementKey } from './ledger.ts'
import type { AssetId } from './schema.ts'
import { type Candidate, type LegKey, legKey, type Via } from './transfers.ts'

export type Amount = { assetId: AssetId; quantity: bigint }

type Flow = { key: MovementKey; time: number } & (
  | { state: 'internal'; from: string; to: string; via: Via; sent: Amount; received: Amount }
  | {
      state: 'outside'
      accountId: string
      kind: 'transfer' | 'fee' | 'income'
      amount: Amount
      assignment: Assignment
    }
  | { state: 'undecided'; accountId: string; amount: Amount; with: readonly Candidate[] }
)

export const flows = (movements: readonly Movement[]): Flow[] =>
  movements.flatMap((row): Flow[] => {
    if (row.kind === 'trade') return []
    const key = { accountId: row.accountId, ref: row.ref }
    const amount = { assetId: row.assetId, quantity: row.quantity }
    const outside: Flow = {
      key,
      time: row.time,
      state: 'outside',
      accountId: row.accountId,
      kind: row.kind,
      amount,
      assignment: row.assignment,
    }
    if (row.kind !== 'transfer') return [outside]
    const { transfer } = row
    if (transfer.state === 'proposed')
      return [
        {
          key,
          time: row.time,
          state: 'undecided',
          accountId: row.accountId,
          amount,
          with: transfer.with,
        },
      ]
    if (transfer.state !== 'paired') return [outside]
    if (row.quantity > 0n) return []
    return [
      {
        key,
        time: row.time,
        state: 'internal',
        from: row.accountId,
        to: transfer.with.accountId,
        via: transfer.via,
        sent: { assetId: row.assetId, quantity: transfer.sent },
        received: { assetId: row.assetId, quantity: transfer.received },
      },
    ]
  })

export type Route = {
  from: string
  to: string
  assetId: AssetId
  sent: bigint
  received: bigint
  count: number
  last: number
}

export const routes = (all: readonly Flow[]): Route[] =>
  [
    ...Map.groupBy(
      all.flatMap((flow) => (flow.state === 'internal' ? [flow] : [])),
      ({ from, to, sent }) => `${from} ${to} ${sent.assetId}`,
    ).values(),
  ]
    .flatMap((group) => {
      const [first] = group
      return first
        ? [
            {
              from: first.from,
              to: first.to,
              assetId: first.sent.assetId,
              sent: group.reduce((total, { sent }) => total + sent.quantity, 0n),
              received: group.reduce((total, { received }) => total + received.quantity, 0n),
              count: group.length,
              last: Math.max(...group.map(({ time }) => time)),
            },
          ]
        : []
    })
    .sort((a, b) => b.count - a.count || b.last - a.last)

export type Proposal = {
  key: LegKey
  with: LegKey
  from: string
  to: string
  time: number
  arrived: number
  assetId: AssetId
  sent: bigint
  received: bigint
  fit: Candidate['fit']
  mutual: boolean
  memo: string | null
  peerMemo: string | null
}

export const proposals = (rows: readonly Movement[]): Proposal[] => {
  const legs = new Map(
    rows.flatMap((row) => (row.kind === 'transfer' ? [[legKey(row.key), row]] : [])),
  )
  return rows
    .flatMap((row): Proposal[] => {
      if (row.kind !== 'transfer' || row.transfer.state !== 'proposed' || row.quantity >= 0n)
        return []
      const [first] = row.transfer.with
      const other = first && legs.get(legKey(first.with))
      if (!first || !other || other.kind !== 'transfer') return []
      const back = other.transfer.state === 'proposed' ? other.transfer.with[0] : undefined
      return [
        {
          key: row.key,
          with: first.with,
          from: row.accountId,
          to: first.with.accountId,
          time: row.time,
          arrived: other.time,
          assetId: row.assetId,
          sent: -row.quantity,
          received: other.quantity,
          fit: first.fit,
          mutual: back !== undefined && legKey(back.with) === legKey(row.key),
          memo: row.memo,
          peerMemo: other.memo,
        },
      ]
    })
    .sort((a, b) => Number(b.mutual) - Number(a.mutual) || b.time - a.time)
}

import { plain } from '../core/search.ts'
import type { Db } from './db.ts'
import { type AssetId, type Day, dayOf, type Kind, q, type Source } from './schema.ts'
import { decisions, type LegKey, legKey, pair, savedRoutes, type Transfer } from './transfers.ts'

type Fact = { accountId: string; assetId: AssetId; time: number; quantity: string }

type Closing = { day: Day; quantity: bigint }
type Hole = { from: number; to: number; quantity: bigint }
export type Coverage =
  | { state: 'outside' }
  | { state: 'ledger'; from: number; to: number; opening: bigint; holes: readonly Hole[] }
type Line = {
  accountId: string
  assetId: AssetId
  closings: readonly Closing[]
  coverage: Coverage
}

export function fold(moves: readonly Fact[], observations: readonly Fact[]): Line[] {
  const facts = [
    ...moves.map((fact) => ({ ...fact, observed: false })),
    ...observations.map((fact) => ({ ...fact, observed: true })),
  ].sort((a, b) => a.time - b.time || Number(a.observed) - Number(b.observed))
  const lines = Map.groupBy(facts, ({ accountId, assetId }) => `${accountId} ${assetId}`)
  return [...lines.values()].flatMap((line) => {
    const [first, last] = [line[0], line.at(-1)]
    if (!first || !last) return []
    const mark = line.find(({ observed }) => observed)
    const opening = mark
      ? line
          .slice(0, line.indexOf(mark))
          .reduce((sum, { quantity }) => sum - BigInt(quantity), BigInt(mark.quantity))
      : 0n
    const closings = new Map<Day, bigint>()
    const holes: Hole[] = []
    let running = opening
    let marked = first.time
    for (const { time, quantity, observed } of line) {
      const value = BigInt(quantity)
      if (observed && running !== value)
        holes.push({ from: marked, to: time, quantity: value - running })
      if (observed) marked = time
      running = observed ? value : running + value
      closings.set(dayOf(time), running)
    }
    return {
      accountId: first.accountId,
      assetId: first.assetId,
      closings: [...closings].map(([day, quantity]) => ({ day, quantity })),
      coverage: line.some(({ observed }) => !observed)
        ? { state: 'ledger', from: first.time, to: last.time, opening, holes }
        : { state: 'outside' },
    }
  })
}

const stored = (table: 'entry' | 'balance', institutionId?: string) => {
  const rows = q.selectFrom(table).select(['accountId', 'assetId', 'time', 'quantity'])
  return institutionId
    ? rows.where(
        'accountId',
        'in',
        q.selectFrom('account').select('id').where('institutionId', '=', institutionId),
      )
    : rows
}

export async function ledger(db: Db, institutionId?: string) {
  const [moves, observations] = await Promise.all([
    db.read(stored('entry', institutionId)),
    db.read(stored('balance', institutionId)),
  ])
  return fold(moves, observations)
}

export type MovementKey = { accountId: string; ref: string }

export const keyOf = ({ accountId, ref }: MovementKey) => `${accountId} ${ref}`

export const partyOf = (memo: string | null) =>
  plain(memo ?? '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && !/\p{N}.*\p{N}/u.test(word))
    .join(' ')

export type Assignment =
  | { state: 'open'; party: string }
  | { state: 'unsure'; party: string }
  | { state: 'ruled'; party: string; categoryId: string; source: Source }
  | { state: 'chosen'; categoryId: string }

type Ruling = { categoryId: string | null; source: Source }

export const rules = (db: Db) =>
  db.read(q.selectFrom('rule').select(['party', 'categoryId', 'source']))

export const ruled = (party: string, { categoryId, source }: Ruling): Assignment =>
  categoryId === null ? { state: 'unsure', party } : { state: 'ruled', party, categoryId, source }

export function assign(
  party: string,
  choice: string | undefined,
  byParty: ReadonlyMap<string, Ruling>,
): Assignment {
  if (choice) return { state: 'chosen', categoryId: choice }
  const rule = byParty.get(party)
  return rule ? ruled(party, rule) : { state: 'open', party }
}

export type Identity =
  | { state: 'open' }
  | { state: 'none'; source: Source }
  | { state: 'linked'; merchantId: string; source: Source }

const identityOf = (row: { merchantId: string | null; source: Source } | undefined): Identity =>
  !row
    ? { state: 'open' }
    : row.merchantId === null
      ? { state: 'none', source: row.source }
      : { state: 'linked', merchantId: row.merchantId, source: row.source }

export type Scope =
  | { accountId: string }
  | { institutionId: string }
  | { cash: true }
  | { all: true }
  | { merchantId: string }
  | { categoryId: string }

export type Movement = {
  accountId: string
  ref: string
  time: number
  memo: string | null
  assetId: AssetId
  quantity: bigint
  note: string | null
} & (
  | { kind: 'trade' }
  | {
      kind: 'transfer'
      key: LegKey
      fee: bigint
      transfer: Transfer
      party: string
      assignment: Assignment
      identity: Identity
    }
  | {
      kind: Exclude<Kind, 'trade' | 'transfer'>
      party: string
      assignment: Assignment
      identity: Identity
    }
)

export async function movements(db: Db, scope: Scope) {
  const [legs, choices, notes, rulings, identities, moves, decided, routed] = await Promise.all([
    db.read(
      q
        .selectFrom('entry')
        .select(['accountId', 'ref', 'leg', 'time', 'kind', 'memo', 'assetId', 'quantity'])
        .$call((query) =>
          'accountId' in scope
            ? query.where('accountId', '=', scope.accountId)
            : 'institutionId' in scope
              ? query.where('accountId', 'in', (accounts) =>
                  accounts
                    .selectFrom('account')
                    .select('id')
                    .where('institutionId', '=', scope.institutionId),
                )
              : 'cash' in scope
                ? query.where('assetId', 'like', 'fiat:%')
                : query,
        )
        .orderBy('time', 'desc')
        .orderBy('accountId')
        .orderBy('ref'),
    ),
    db.read(q.selectFrom('choice').select(['accountId', 'ref', 'categoryId'])),
    db.read(q.selectFrom('note').select(['accountId', 'ref', 'body'])),
    rules(db),
    db.read(q.selectFrom('identity').select(['party', 'merchantId', 'source'])),
    db.read(
      q
        .selectFrom('entry')
        .innerJoin('asset', 'asset.id', 'entry.assetId')
        .select([
          'entry.accountId',
          'entry.ref',
          'entry.leg',
          'entry.time',
          'entry.quantity',
          'entry.memo',
          'asset.canonical',
        ])
        .where('entry.kind', '=', 'transfer'),
    ),
    decisions(db),
    savedRoutes(db),
  ])
  const mains = [...Map.groupBy(moves, (leg) => `${keyOf(leg)} ${leg.canonical}`).values()].flatMap(
    ([main]) => main ?? [],
  )
  const transfers = pair(
    mains.map(({ accountId, ref, leg, time, quantity, memo, canonical }) => ({
      key: { accountId, ref, leg },
      time,
      asset: canonical,
      quantity: BigInt(quantity),
      party: partyOf(memo),
    })),
    decided,
    routed,
  )
  const chosen = new Map(choices.map((choice) => [keyOf(choice), choice.categoryId]))
  const noted = new Map(notes.map((note) => [keyOf(note), note.body]))
  const byParty = new Map(rulings.map(({ party, ...rule }) => [party, rule]))
  const known = new Map(identities.map(({ party, ...row }) => [party, row]))
  const swaps = new Set(legs.filter(({ kind }) => kind === 'trade').map(keyOf))
  const rows = [...Map.groupBy(legs, (leg) => `${keyOf(leg)} ${leg.assetId}`).values()].flatMap(
    (group): Movement[] => {
      const [first] = group
      if (!first) return []
      const key = keyOf(first)
      const main = group.find(({ kind }) => kind !== 'fee') ?? first
      const { kind, leg, ...row } = main
      const moved = {
        ...row,
        quantity: group.reduce((sum, leg) => sum + BigInt(leg.quantity), 0n),
        note: noted.get(key) ?? null,
      }
      if (kind === 'trade' || swaps.has(key)) return [{ ...moved, kind: 'trade' }]
      const party = partyOf(main.memo)
      const filed = {
        party,
        assignment: assign(party, chosen.get(key), byParty),
        identity: identityOf(known.get(party)),
      }
      if (kind !== 'transfer') return [{ ...moved, ...filed, kind }]
      const legged = { accountId: main.accountId, ref: main.ref, leg }
      return [
        {
          ...moved,
          ...filed,
          kind,
          key: legged,
          fee: group.reduce(
            (sum, leg) => (leg.kind === 'fee' ? sum + BigInt(leg.quantity) : sum),
            0n,
          ),
          transfer: transfers.get(legKey(legged)) ?? { state: 'unmatched' },
        },
      ]
    },
  )
  if ('merchantId' in scope)
    return rows.filter(
      (row) =>
        row.kind !== 'trade' &&
        row.identity.state === 'linked' &&
        row.identity.merchantId === scope.merchantId,
    )
  if ('categoryId' in scope)
    return rows.filter(
      (row) =>
        row.kind !== 'trade' &&
        'categoryId' in row.assignment &&
        row.assignment.categoryId === scope.categoryId,
    )
  return rows
}

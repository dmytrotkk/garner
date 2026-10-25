import type { ExpressionBuilder } from 'kysely'
import type { Db } from './db'
import { type CanonicalId, type DecisionRow, q, type RouteRow, type Schema, scale } from './schema'

export type LegKey = { accountId: string; ref: string; leg: string }

export const legKey = ({ accountId, ref, leg }: LegKey) => `${accountId} ${ref} ${leg}`

type Verdict = { state: 'external' } | { state: 'paired'; with: LegKey }

type Decision = { key: LegKey } & Verdict

const decisionOf = ({
  accountId,
  ref,
  leg,
  peerAccountId,
  peerRef,
  peerLeg,
}: DecisionRow): Decision =>
  peerAccountId && peerRef && peerLeg
    ? {
        key: { accountId, ref, leg },
        state: 'paired',
        with: { accountId: peerAccountId, ref: peerRef, leg: peerLeg },
      }
    : { key: { accountId, ref, leg }, state: 'external' }

export const decisions = async (db: Db) =>
  (await db.read(q.selectFrom('decision').selectAll())).map(decisionOf)

type Fit = 'exact' | 'short'
export type Candidate = { with: LegKey; fit: Fit }
export type Via = 'user' | 'twin' | 'route'
export type Transfer =
  | { state: 'unmatched' }
  | { state: 'proposed'; with: readonly Candidate[] }
  | { state: 'paired'; via: Via; with: LegKey; sent: bigint; received: bigint }
  | { state: 'external' }

export const peer = (transfer: Transfer) =>
  transfer.state === 'paired'
    ? transfer.with
    : transfer.state === 'proposed'
      ? transfer.with[0]?.with
      : undefined

export type Leg = { key: LegKey; time: number; asset: CanonicalId; quantity: bigint; party: string }

const window = 4
export const daysOf = (time: number) => Math.floor(time / 86_400_000)
const max = (a: bigint, b: bigint) => (a > b ? a : b)
const min = (a: bigint, b: bigint) => (a < b ? a : b)

const fitOf = (sent: bigint, received: bigint, asset: CanonicalId): Fit | undefined => {
  if (received === sent) return 'exact'
  const floor = asset.startsWith('fiat:') ? min(10n ** BigInt(scale), sent / 20n) : sent / 10n
  return received < sent && sent - received <= max((sent * 15n) / 1000n, floor)
    ? 'short'
    : undefined
}

const order = (a: Leg, b: Leg) => a.time - b.time || legKey(a.key).localeCompare(legKey(b.key))

export function pair(
  legs: readonly Leg[],
  decided: readonly Decision[],
  routed: readonly RouteRow[],
): Map<string, Transfer> {
  const byKey = new Map(legs.map((leg) => [legKey(leg.key), leg]))
  const free = new Set(byKey.keys())
  const result = new Map<string, Transfer>()
  const bind = (a: Leg, b: Leg, via: Via) => {
    const [out, into] = a.quantity < 0n ? [a, b] : [b, a]
    const sent = -out.quantity
    const received = into.quantity
    result.set(legKey(out.key), { state: 'paired', via, with: into.key, sent, received })
    result.set(legKey(into.key), { state: 'paired', via, with: out.key, sent, received })
    free.delete(legKey(out.key))
    free.delete(legKey(into.key))
  }
  for (const decision of decided) {
    const own = byKey.get(legKey(decision.key))
    if (!own || !free.has(legKey(decision.key))) continue
    if (decision.state === 'external') {
      result.set(legKey(own.key), { state: 'external' })
      free.delete(legKey(own.key))
      continue
    }
    const other = byKey.get(legKey(decision.with))
    if (other && free.has(legKey(other.key))) bind(own, other, 'user')
  }
  const ordered = legs.filter((leg) => free.has(legKey(leg.key))).toSorted(order)
  const twins = Map.groupBy(ordered, ({ time, asset, party }) => `${time} ${asset} ${party}`)
  for (const group of twins.values())
    for (const out of group) {
      if (out.quantity >= 0n || !out.party || !free.has(legKey(out.key))) continue
      const into = group.find(
        (leg) =>
          free.has(legKey(leg.key)) &&
          leg.key.accountId !== out.key.accountId &&
          leg.quantity === -out.quantity,
      )
      if (into) bind(out, into, 'twin')
    }
  const rest = ordered.filter((leg) => free.has(legKey(leg.key)))
  const near = Map.groupBy(rest, ({ asset, time }) => `${asset} ${daysOf(time)}`)
  const around = (leg: Leg) =>
    Array.from({ length: 2 * window + 1 }, (_, offset) => daysOf(leg.time) + offset - window)
      .flatMap((day) => near.get(`${leg.asset} ${day}`) ?? [])
      .filter(
        (other) =>
          free.has(legKey(other.key)) &&
          other.key.accountId !== leg.key.accountId &&
          other.quantity < 0n !== leg.quantity < 0n,
      )
  const saved = new Set(routed.map(({ fromId, toId }) => `${fromId} ${toId}`))
  for (const out of rest) {
    if (out.quantity >= 0n || !free.has(legKey(out.key))) continue
    const [into] = around(out)
      .filter(
        (leg) =>
          leg.quantity === -out.quantity && saved.has(`${out.key.accountId} ${leg.key.accountId}`),
      )
      .sort(
        (a, b) =>
          Math.abs(a.time - out.time) - Math.abs(b.time - out.time) ||
          legKey(a.key).localeCompare(legKey(b.key)),
      )
    if (into) bind(out, into, 'route')
  }
  const matches = (leg: Leg) =>
    around(leg)
      .flatMap((other) => {
        const [sent, received] =
          leg.quantity < 0n ? [-leg.quantity, other.quantity] : [-other.quantity, leg.quantity]
        const fit = fitOf(sent, received, leg.asset)
        return fit ? [{ with: other.key, fit, distance: Math.abs(other.time - leg.time) }] : []
      })
      .sort(
        (a, b) =>
          Number(a.fit === 'short') - Number(b.fit === 'short') ||
          a.distance - b.distance ||
          legKey(a.with).localeCompare(legKey(b.with)),
      )
      .map(({ with: key, fit }) => ({ with: key, fit }))
  for (const leg of rest) {
    if (!free.has(legKey(leg.key))) continue
    const found = matches(leg)
    result.set(
      legKey(leg.key),
      found.length ? { state: 'proposed', with: found } : { state: 'unmatched' },
    )
  }
  return result
}

export const savedRoutes = (db: Db) => db.read(q.selectFrom('route').selectAll())

export async function saveRoute(db: Db, fromId: string, toId: string) {
  if (fromId === toId) throw new Error('Choose another account.')
  await db.write(
    q
      .insertInto('route')
      .values({ fromId, toId })
      .onConflict((oc) => oc.doNothing()),
  )
}

export const forgetRoute = (db: Db, fromId: string, toId: string) =>
  db.write(q.deleteFrom('route').where('fromId', '=', fromId).where('toId', '=', toId))

const touching =
  ({ accountId, ref, leg }: LegKey) =>
  (eb: ExpressionBuilder<Schema, 'decision'>) =>
    eb.or([
      eb.and({ accountId, ref, leg }),
      eb.and({ peerAccountId: accountId, peerRef: ref, peerLeg: leg }),
    ])

const naming = (key: LegKey) => q.deleteFrom('decision').where(touching(key))

type Side = LegKey & { quantity: bigint; asset: CanonicalId }

async function legsOf(db: Db, key: LegKey, peer?: LegKey): Promise<[Side, Side | undefined]> {
  const keys = peer ? [key, peer] : [key]
  const rows = await db.read(
    q
      .selectFrom('entry')
      .innerJoin('asset', 'asset.id', 'entry.assetId')
      .select([
        'entry.accountId',
        'entry.ref',
        'entry.leg',
        'entry.kind',
        'entry.quantity',
        'asset.canonical',
      ])
      .where((eb) =>
        eb.or(
          keys.map((wanted) =>
            eb.and([
              eb('entry.accountId', '=', wanted.accountId),
              eb('entry.ref', '=', wanted.ref),
              eb('entry.leg', '=', wanted.leg),
            ]),
          ),
        ),
      ),
  )
  const sideOf = (wanted: LegKey): Side => {
    const found = rows.find((row) => legKey(row) === legKey(wanted))
    if (found?.kind !== 'transfer') throw new Error('Unknown movement.')
    return { ...wanted, quantity: BigInt(found.quantity), asset: found.canonical }
  }
  return [sideOf(key), peer && sideOf(peer)]
}

function pairedRow(own: Side, other: Side) {
  if (own.accountId === other.accountId) throw new Error('Choose another account.')
  if (own.asset !== other.asset) throw new Error('A transfer keeps its asset.')
  if (own.quantity < 0n === other.quantity < 0n)
    throw new Error('A transfer has a sender and a receiver.')
  const [out, into] = own.quantity < 0n ? [own, other] : [other, own]
  if (-out.quantity < into.quantity) throw new Error('A transfer never gains.')
  return {
    accountId: out.accountId,
    ref: out.ref,
    leg: out.leg,
    kind: 'paired' as const,
    peerAccountId: into.accountId,
    peerRef: into.ref,
    peerLeg: into.leg,
  }
}

export async function decide(db: Db, key: LegKey, verdict: Verdict) {
  const peer = verdict.state === 'paired' ? verdict.with : undefined
  const [own, other] = await legsOf(db, key, peer)
  const row = other
    ? pairedRow(own, other)
    : { ...key, kind: 'external' as const, peerAccountId: null, peerRef: null, peerLeg: null }
  await db.write(naming(key), ...(peer ? [naming(peer)] : []), q.insertInto('decision').values(row))
}

export async function undecide(db: Db, key: LegKey) {
  const found = await db.read(q.selectFrom('decision').select('accountId').where(touching(key)))
  if (!found.length) throw new Error('Unknown decision.')
  await db.write(naming(key))
}

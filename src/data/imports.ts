import { sql } from 'kysely'
import { uuidv7 } from '../core/id'
import type { Db } from './db'
import { type Coverage, fold } from './ledger'
import { activobank } from './parsers/activobank'
import { revolut } from './parsers/revolut'
import { santander } from './parsers/santander'
import {
  addAssets,
  type Balance,
  bind,
  type CanonicalId,
  dayOf,
  type Entry,
  type Import,
  q,
} from './schema'
import { fiat } from './settings'
import { type Doc, type Parser, type Statement, view } from './statement'
import { legKey } from './transfers'

export const parsers: readonly Parser[] = [revolut, santander, activobank]
const currencies = new Set(Intl.supportedValuesOf('currency'))

export type Target =
  | { state: 'account'; accountId: string }
  | { state: 'new'; accountId: string; name: string }
export type Route = Readonly<Record<string, Target>>

type File = {
  id: string
  name: string
  raw: string
  parser: Parser
  statement: Statement
  accounts: Readonly<Record<string, string>> | null
}
type Named = { id: string; name: string }
type Fresh = Extract<Target, { state: 'new' }>

export type Draft = {
  institution: Named & { fresh: boolean }
  accounts: readonly Named[]
  files: readonly File[]
  removed: string | null
  balances: readonly Balance[]
  controls: readonly { key: string; label: string; fresh: Fresh }[]
}

type Window = { accountId: string; assetId: CanonicalId; from: number; to: number }

export type Line = Window & {
  account: string
  added: number
  known: number
  net: bigint
  closing: bigint
  coverage: Coverage
}

export type Blocked =
  | { reason: 'nothing' }
  | { reason: 'unrouted' | 'shared'; label: string }
  | { reason: 'twice'; file: string; ref: string }

export type Plan = {
  route: Route
  institution: Draft['institution']
  accounts: readonly Fresh[]
  imports: readonly Import[]
  removed: string | null
  ids: readonly string[]
  scope: readonly Window[]
  entries: readonly Entry[]
  observations: readonly Balance[]
  lines: readonly Line[]
  skipped: Readonly<Record<string, number>>
  unknown: Readonly<Record<string, number>>
  replaced: number
  blocked: Blocked | null
}

export const institutionOf = sql<string | null>`(
  select account.institutionId from json_each(import.accounts) as fed
  join account on account.id = fed.value limit 1)`

const stored = (institutionId: string) =>
  q.selectFrom('import').where(institutionOf, '=', institutionId).orderBy('id')

export const imports = (db: Db, institutionId: string) =>
  db.read(stored(institutionId).select(['id', 'name']))

const routed = (parser: Parser, label: string) => `${parser.id} ${label}`

const accountName = (parser: Parser, label: string) =>
  `${parser.name} ${/\p{L}/u.test(label) || !label ? label : `••${label.slice(-4)}`}`.trim()

const frozen = (files: readonly File[], accounts: readonly Named[]) =>
  new Map(
    files.flatMap(({ parser, accounts: fed }) =>
      Object.entries(fed ?? {}).flatMap(([label, id]) =>
        accounts.some((account) => account.id === id) ? [[routed(parser, label), id] as const] : [],
      ),
    ),
  )

function parsed({ name, text: raw }: Doc) {
  try {
    const text = view(raw)
    const parser = parsers.find(({ detect }) => detect(text))
    if (!parser)
      throw new Error(
        `it is not an export garner knows. It starts with: ${text.slice(0, 80).split(/[\r\n]/, 1)[0]}`,
      )
    const statement = parser.parse(text)
    if (statement.rows.some(({ unit }) => !('fiat' in unit && currencies.has(unit.fiat))))
      throw new Error('it holds assets that are not currencies, which cannot be imported yet.')
    return { name, raw, parser, statement }
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function home(
  db: Db,
  added: readonly File[],
  institutionId: string | undefined,
  now: number,
) {
  const bank = added[0]?.parser.name ?? ''
  const fed = institutionId
    ? undefined
    : (
        await db.read(q.selectFrom('import').select(['raw', institutionOf.as('institutionId')]))
      ).find(({ raw }) => added.some(({ parser }) => parser.detect(view(raw))))
  const id = institutionId ?? fed?.institutionId
  const institutions = q.selectFrom('institution').select(['id', 'name']).orderBy('id')
  const [institution] = await db.read(
    id ? institutions.where('id', '=', id) : institutions.where('name', '=', bank),
  )
  if (institution) return { ...institution, fresh: false }
  if (institutionId) throw new Error('Unknown institution.')
  return { id: uuidv7(now), name: bank, fresh: true }
}

export async function read(
  db: Db,
  docs: readonly Doc[],
  institutionId?: string,
  accountId?: string,
  now = Date.now(),
): Promise<{ draft: Draft; route: Route }> {
  const added = docs.map((doc): File => ({ id: uuidv7(now), accounts: null, ...parsed(doc) }))
  const institution = await home(db, added, institutionId, now)
  const within = q.selectFrom('account').select('id').where('institutionId', '=', institution.id)
  const [kept, accounts, balances] = await Promise.all([
    db.read(stored(institution.id).select(['id', 'name', 'raw', 'accounts'])),
    db.read(within.select('name').where('kind', '=', 'manual').orderBy('id')),
    db.read(q.selectFrom('balance').selectAll().where('accountId', 'in', within)),
  ])
  const texts = new Set(kept.map(({ raw }) => raw))
  const files = [
    ...kept.map(
      ({ id, name, raw, accounts }): File => ({
        id,
        accounts: JSON.parse(accounts),
        ...parsed({ name, text: raw }),
      }),
    ),
    ...added.filter(({ raw }) => !texts.has(raw) && texts.add(raw)),
  ]
  const fixed = frozen(files, accounts)
  const labels = new Map(
    files.flatMap(({ parser, statement }) =>
      statement.rows.map(({ label }) => [routed(parser, label), { parser, label }] as const),
    ),
  )
  const controls = [...labels]
    .filter(([key]) => !fixed.has(key))
    .map(([key, { parser, label }]) => {
      const fresh = {
        state: 'new' as const,
        accountId: uuidv7(now),
        name: accountName(parser, label),
      }
      return { key, label, fresh }
    })
  const fed = new Set(fixed.values())
  const brought = new Set(
    added.flatMap(({ parser, statement }) =>
      statement.rows.map(({ label }) => routed(parser, label)),
    ),
  )
  const started =
    controls.filter(({ key }) => brought.has(key)).length === 1 &&
    accounts.find(({ id }) => id === accountId && !fed.has(id))
  const route = Object.fromEntries(
    controls.map(({ key, fresh }): [string, Target] => {
      const named =
        (brought.has(key) && started) || accounts.find(({ name }) => name === fresh.name)
      return [key, named ? { state: 'account', accountId: named.id } : fresh]
    }),
  )
  return { draft: { institution, accounts, files, removed: null, balances, controls }, route }
}

function build(
  files: readonly File[],
  target: (parser: Parser, label: string) => string | undefined,
) {
  const entries = new Map<string, Entry>()
  const observations = new Map<string, Balance>()
  const windows: Window[] = []
  const blocked: Blocked[] = []
  const owners = new Map<string, string>()
  for (const { parser, statement } of files)
    for (const label of new Set(statement.rows.map((row) => row.label))) {
      const accountId = target(parser, label)
      const owned = `${parser.id} ${accountId}`
      if (accountId && (owners.get(owned) ?? label) === label) owners.set(owned, label)
      else blocked.push({ reason: accountId ? 'shared' : 'unrouted', label })
    }
  const last = ({ statement }: File) =>
    statement.rows.reduce((latest, { time }) => Math.max(latest, time), 0)
  const order = (a: File, b: File) => last(a) - last(b) || (a.id < b.id ? -1 : 1)
  for (const { name: file, parser, statement } of files.toSorted(order)) {
    const seen = new Set<string>()
    const days = new Map<string, Balance>()
    for (const [label, rows] of Map.groupBy(statement.rows, ({ label }) => label)) {
      const accountId = target(parser, label)
      if (!accountId || owners.get(`${parser.id} ${accountId}`) !== label) continue
      for (const [code, moves] of Map.groupBy(rows, ({ unit }) =>
        'fiat' in unit ? unit.fiat : '',
      )) {
        const assetId: CanonicalId = `fiat:${code}`
        windows.push({
          accountId,
          assetId,
          from: moves.reduce((least, { time }) => Math.min(least, time), Number.POSITIVE_INFINITY),
          to: moves.reduce((most, { time }) => Math.max(most, time), 0),
        })
        for (const { ref, time, legs, balance, peer, memo } of moves) {
          for (const { leg, kind, amount } of legs) {
            const key = legKey({ accountId, ref, leg })
            if (seen.has(key)) blocked.push({ reason: 'twice', file, ref })
            seen.add(key)
            const quantity = String(amount)
            entries.set(key, { accountId, ref, leg, time, kind, assetId, quantity, peer, memo })
          }
          const day = dayOf(time)
          const mark = `${accountId} ${assetId} ${day}`
          const at = Math.max(days.get(mark)?.time ?? 0, time)
          if (balance !== null)
            days.set(mark, { accountId, assetId, day, time: at, quantity: String(balance) })
        }
      }
    }
    for (const [mark, seen] of days)
      if ((observations.get(mark)?.time ?? 0) <= seen.time) observations.set(mark, seen)
  }
  return { entries, observations, windows, blocked: blocked[0] ?? null }
}

const inside = (windows: readonly Window[], { accountId, assetId, time }: Balance) =>
  windows.some(
    (window) =>
      window.accountId === accountId &&
      window.assetId === assetId &&
      window.from <= time &&
      time <= window.to,
  )

const same = <Row>(before: Map<string, Row>, after: Map<string, Row>) =>
  before.size === after.size &&
  [...after].every(([key, row]) => JSON.stringify(before.get(key)) === JSON.stringify(row))

function tally(counts: readonly Readonly<Record<string, number | undefined>>[]) {
  const sum: Record<string, number> = {}
  for (const [name, count] of counts.flatMap((count) => Object.entries(count)))
    sum[name] = (sum[name] ?? 0) + (count ?? 0)
  return sum
}

export function plan(draft: Draft, route: Route): Plan {
  const fixed = frozen(draft.files, draft.accounts)
  const target = (parser: Parser, label: string) =>
    fixed.get(routed(parser, label)) ?? route[routed(parser, label)]?.accountId
  const remaining = draft.files.filter(({ id }) => id !== draft.removed)
  const kept = draft.files.filter(({ accounts }) => accounts)
  const before = build(kept, (parser, label) => fixed.get(routed(parser, label)))
  const after = build(remaining, target)
  const scope = [...before.windows, ...after.windows]
  const entries = [...after.entries.values()]
  const observations = [...after.observations.values()]
  const folded = fold(entries, [
    ...observations,
    ...draft.balances.filter((balance) => !inside(scope, balance)),
  ])
  const fresh = Object.values(route).flatMap((to) => (to.state === 'new' ? to : []))
  const names = new Map([
    ...draft.accounts.map(({ id, name }) => [id, name] as const),
    ...fresh.map(({ accountId, name }) => [accountId, name] as const),
  ])
  const folds = new Map(folded.map((line) => [`${line.accountId} ${line.assetId}`, line]))
  const fed = Map.groupBy(after.windows, ({ accountId, assetId }) => `${accountId} ${assetId}`)
  const lines = [...fed].flatMap(([key, windows]): Line | [] => {
    const line = folds.get(key)
    const [first] = windows
    if (!line || !first) return []
    const { accountId, assetId } = first
    const moved = entries.filter(
      (entry) => entry.accountId === accountId && entry.assetId === assetId,
    )
    const rows = [...Map.groupBy(moved, ({ ref }) => ref).values()]
    const known = rows.filter((legs) =>
      legs.every(({ ref, leg }) => before.entries.has(legKey({ accountId, ref, leg }))),
    ).length
    return {
      accountId,
      assetId,
      account: names.get(accountId) ?? '',
      from: Math.min(...windows.map(({ from }) => from)),
      to: Math.max(...windows.map(({ to }) => to)),
      added: rows.length - known,
      known,
      net: moved.reduce((sum, { quantity }) => sum + BigInt(quantity), 0n),
      closing: line.closings.at(-1)?.quantity ?? 0n,
      coverage: line.coverage,
    }
  })
  const added = draft.files.filter(({ accounts }) => !accounts)
  return {
    route,
    institution: draft.institution,
    accounts: fresh,
    imports: remaining.flatMap(({ id, name, raw, parser, statement, accounts }) => {
      const fedBy = JSON.stringify(
        Object.fromEntries(
          [...new Set(statement.rows.map(({ label }) => label))].flatMap((label) => {
            const accountId = target(parser, label)
            return accountId ? [[label, accountId]] : []
          }),
        ),
      )
      return fedBy === '{}' || (accounts && JSON.stringify(accounts) === fedBy)
        ? []
        : { id, name, raw, tickers: '{}', accounts: fedBy }
    }),
    removed: draft.removed,
    ids: kept.map(({ id }) => id),
    scope,
    entries,
    observations,
    lines,
    skipped: tally(added.map(({ statement }) => statement.skipped)),
    unknown: tally(added.map(({ statement }) => statement.unknown)),
    replaced: draft.balances.filter((balance) => {
      const mark = `${balance.accountId} ${balance.assetId} ${balance.day}`
      const own = before.observations.get(mark)
      return (
        (own?.time !== balance.time || own.quantity !== balance.quantity) &&
        (inside(scope, balance) || (after.observations.get(mark)?.time ?? 0) > balance.time)
      )
    }).length,
    blocked:
      after.blocked ??
      (same(before.entries, after.entries) && same(before.observations, after.observations)
        ? { reason: 'nothing' }
        : null),
  }
}

const each = (rows: readonly unknown[]) => sql`json_each(${JSON.stringify(rows)}) as j`

const rebuild = ({ scope, entries, observations }: Plan) =>
  [
    sql`delete from entry
      where accountId in (select j.value ->> 'accountId' from ${each(scope)})
        and ref not glob 'user:*' and ref not glob 'eip155:*'`,
    sql`delete from balance
      where exists (
        select 1 from ${each(scope)}
        where j.value ->> 'accountId' = balance.accountId
          and j.value ->> 'assetId' = balance.assetId
          and balance.time between j.value ->> 'from' and j.value ->> 'to')`,
    sql`insert into entry (accountId, ref, leg, time, kind, assetId, quantity, peer, memo)
      select j.value ->> 'accountId', j.value ->> 'ref', j.value ->> 'leg', j.value ->> 'time',
        j.value ->> 'kind', j.value ->> 'assetId', j.value ->> 'quantity', j.value ->> 'peer',
        j.value ->> 'memo'
      from ${each(entries)}`,
    sql`insert into balance (accountId, assetId, day, time, quantity)
      select j.value ->> 'accountId', j.value ->> 'assetId', j.value ->> 'day',
        j.value ->> 'time', j.value ->> 'quantity'
      from ${each(observations)}
      where true
      on conflict (accountId, assetId, day) do update
        set time = excluded.time, quantity = excluded.quantity
        where excluded.time > balance.time`,
  ].map(bind)

export async function applyImport(db: Db, plan: Plan, now = Date.now()) {
  const { id, name, fresh } = plan.institution
  const current = await db.read(stored(id).select('id'))
  if (current.map((row) => row.id).join() !== plan.ids.join())
    throw new Error('The imports of this institution changed. Start the import again.')
  const assets = [...new Set([...plan.entries, ...plan.observations].map(({ assetId }) => assetId))]
  const created = plan.accounts.map((account) => ({
    id: account.accountId,
    name: account.name,
    institutionId: id,
    kind: 'manual' as const,
    address: null,
    updatedAt: now,
  }))
  await db.write(
    ...(fresh ? [q.insertInto('institution').values({ id, name, updatedAt: now })] : []),
    ...(created.length ? [q.insertInto('account').values(created)] : []),
    ...(assets.length ? [addAssets(assets.map((id) => fiat(id.slice('fiat:'.length))))] : []),
    ...(plan.imports.length
      ? [
          q
            .insertInto('import')
            .values([...plan.imports])
            .onConflict((oc) =>
              oc.column('id').doUpdateSet((eb) => ({ accounts: eb.ref('excluded.accounts') })),
            ),
        ]
      : []),
    ...(plan.removed ? [q.deleteFrom('import').where('id', '=', plan.removed)] : []),
    ...rebuild(plan),
  )
}

export async function removeImport(db: Db, id: string, now = Date.now()) {
  const [found] = await db.read(
    q.selectFrom('import').select(institutionOf.as('institutionId')).where('id', '=', id),
  )
  if (!found?.institutionId) throw new Error('Unknown import.')
  const { draft } = await read(db, [], found.institutionId, undefined, now)
  await applyImport(db, plan({ ...draft, removed: id }, {}), now)
}

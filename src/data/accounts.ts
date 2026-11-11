import { isAddress, parseUnits } from 'viem'
import { short } from '../core/format.ts'
import { uuidv7 } from '../core/id.ts'
import type { Db } from './db.ts'
import { institutionOf } from './imports.ts'
import {
  type Account,
  type Address,
  addAssets,
  type CanonicalId,
  coin,
  dayOf,
  type EvmAccount,
  exists,
  type Institution,
  type ManualAccount,
  q,
  scale,
} from './schema.ts'

const held = q
  .selectFrom('balance')
  .select('assetId')
  .union(q.selectFrom('entry').select('assetId'))
const kept = q.selectFrom('asset').select('canonical').where('id', 'in', held)

const prune = [
  q.deleteFrom('import').where(institutionOf, 'is', null),
  q.deleteFrom('price').where('assetId', 'not in', kept).where('assetId', 'not like', 'fiat:%'),
  q
    .deleteFrom('asset')
    .where('id', 'not in', held)
    .where('id', 'not in', kept)
    .where('id', 'not like', 'fiat:%'),
]

function named(name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Enter a name.')
  return trimmed
}

export type Table = 'institution' | 'account'

export async function createInstitution(
  db: Db,
  name: string,
  now = Date.now(),
): Promise<Institution> {
  const institution = { id: uuidv7(now), name: named(name), updatedAt: now }
  await db.write(q.insertInto('institution').values(institution))
  return institution
}

export async function rename(db: Db, table: Table, id: string, name: string, now = Date.now()) {
  const stored = named(name)
  await exists(db, table, id)
  await db.write(q.updateTable(table).set({ name: stored, updatedAt: now }).where('id', '=', id))
  return { id, name: stored }
}

export async function remove(db: Db, table: Table, id: string) {
  await exists(db, table, id)
  await db.write(q.deleteFrom(table).where('id', '=', id), ...prune)
}

const fresh = (institutionId: string, name: string, now: number) => ({
  id: uuidv7(now),
  institutionId,
  name,
  updatedAt: now,
})

async function insert<Added extends Account>(db: Db, account: Added) {
  await db.write(q.insertInto('account').values(account))
  return account
}

export async function createEvmAccount(
  db: Db,
  institutionId: string,
  input: string,
  name = '',
  now = Date.now(),
): Promise<EvmAccount> {
  const typed = input.trim()
  if (!isAddress(typed)) throw new Error('Enter a valid EVM address.')
  const address = typed.toLowerCase() as Address
  await exists(db, 'institution', institutionId)
  if ((await db.read(q.selectFrom('account').select('id').where('address', '=', address))).length)
    throw new Error('This account is already added.')
  return insert(db, {
    ...fresh(institutionId, name.trim() || short(address), now),
    kind: 'evm',
    address,
  })
}

export async function createManualAccount(
  db: Db,
  institutionId: string,
  name: string,
  now = Date.now(),
): Promise<ManualAccount> {
  const trimmed = named(name)
  await exists(db, 'institution', institutionId)
  return insert(db, { ...fresh(institutionId, trimmed, now), kind: 'manual', address: null })
}

const holding = (accountId: string, assetId: CanonicalId, quantity: string, now: number) =>
  q
    .insertInto('balance')
    .values({ accountId, assetId, day: dayOf(now), time: now, quantity })
    .onConflict((oc) =>
      oc.columns(['accountId', 'assetId', 'day']).doUpdateSet({ time: now, quantity }),
    )

const sinceDay = (since: string, now: number) => {
  const time = Date.parse(`${since}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || Number.isNaN(time) || since > dayOf(now))
    throw new Error('Choose a day up to today.')
  return Math.min(time, now)
}

export async function setHolding(
  db: Db,
  accountId: string,
  assetId: CanonicalId,
  amount: string,
  since?: string,
  now = Date.now(),
) {
  const text = amount.trim()
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) throw new Error('Enter an amount, like 0.5.')
  const at = since ? sinceDay(since, now) : now
  const quantity = parseUnits(text, scale).toString()
  await exists(db, 'account', accountId)
  const [token] = await db.read(
    q.selectFrom('token').select(['symbol', 'name']).where('id', '=', assetId),
  )
  if (!token) await exists(db, 'asset', assetId)
  await db.write(
    ...(token ? [addAssets(coin(assetId, token.symbol.toUpperCase(), token.name))] : []),
    holding(accountId, assetId, quantity, at),
    ...(at < now ? [holding(accountId, assetId, quantity, now)] : []),
  )
}

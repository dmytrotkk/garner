import { uuidv7 } from '../core/id.ts'
import type { Db } from './db.ts'
import { partyOf } from './ledger.ts'
import { exists, q } from './schema.ts'

export const merchantKinds = [
  'supermarket',
  'bakery',
  'restaurant',
  'cafe',
  'bar',
  'delivery',
  'shop',
  'marketplace',
  'pharmacy',
  'clinic',
  'gym',
  'salon',
  'fuel',
  'parking',
  'toll',
  'transit',
  'taxi',
  'airline',
  'hotel',
  'travel',
  'garage',
  'cinema',
  'streaming',
  'games',
  'venue',
  'media',
  'software',
  'telecom',
  'utility',
  'insurer',
  'bank',
  'exchange',
  'lender',
  'employer',
  'government',
  'school',
  'charity',
  'services',
] as const

export type MerchantKind = (typeof merchantKinds)[number]

export const merchants = (db: Db) =>
  db.read(q.selectFrom('merchant').select(['id', 'name', 'kind']).orderBy('name'))

type MerchantInput = { name: string; kind: string }

async function checked(db: Db, { name, kind }: MerchantInput, id = '') {
  const trimmed = name.trim()
  const folded = partyOf(trimmed)
  if (!folded) throw new Error('Enter a name.')
  const known = merchantKinds.find((key) => key === kind)
  if (!known) throw new Error('Choose a kind.')
  const rows = await merchants(db)
  if (rows.some((row) => row.id !== id && partyOf(row.name) === folded))
    throw new Error('A merchant with this name exists.')
  return { name: trimmed, kind: known }
}

export async function createMerchant(db: Db, input: MerchantInput, now = Date.now()) {
  const merchant = { id: uuidv7(now), ...(await checked(db, input)), updatedAt: now }
  await db.write(q.insertInto('merchant').values(merchant))
  return merchant
}

export async function editMerchant(db: Db, id: string, input: MerchantInput, now = Date.now()) {
  await exists(db, 'merchant', id)
  const fields = await checked(db, input, id)
  await db.write(
    q
      .updateTable('merchant')
      .set({ ...fields, updatedAt: now })
      .where('id', '=', id),
  )
}

export async function removeMerchant(db: Db, id: string) {
  await exists(db, 'merchant', id)
  await db.write(q.deleteFrom('merchant').where('id', '=', id))
}

export async function identify(db: Db, party: string, merchantId: string | null) {
  if (!party || partyOf(party) !== party) throw new Error('Unknown party.')
  if (merchantId === '') throw new Error('Choose a merchant.')
  if (merchantId !== null) await exists(db, 'merchant', merchantId)
  await db.write(
    q
      .insertInto('identity')
      .values({ party, merchantId, source: 'user' })
      .onConflict((oc) => oc.column('party').doUpdateSet({ merchantId, source: 'user' })),
  )
}

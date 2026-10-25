import { formatUnits } from 'viem'
import { plural } from '../core/format'
import { uuidv7 } from '../core/id'
import type { Db } from './db'
import { type Movement, type MovementKey, movements, partyOf, rules } from './ledger'
import { type MerchantKind, merchantKinds, merchants } from './merchants'
import { categoryTypes, dayOf, exists, type Kind, q, type Source, scale } from './schema'
import { daysOf } from './transfers'

const icons = [
  'basket',
  'restaurant',
  'home',
  'plug',
  'bus',
  'plane',
  'bag',
  'medicine',
  'scissor',
  'ticket',
  'cloud',
  'cap',
  'shield',
  'taxes',
  'invoice',
  'gift',
  'atm',
  'briefcase',
  'receive',
  'transfer',
  'coffee',
  'car',
  'fuel',
  'phone',
  'pet',
  'baby',
  'people',
  'bank',
  'repeat',
  'tag',
  'laptop',
  'percent',
  'key',
  'handshake',
] as const

export type CategoryIcon = (typeof icons)[number]

const swap = (legs: readonly { kind: Kind }[]) => legs.some(({ kind }) => kind === 'trade')

export const categories = (db: Db) =>
  db.read(q.selectFrom('category').select(['id', 'name', 'icon', 'type', 'hint']).orderBy('name'))

async function legs(db: Db, { accountId, ref }: MovementKey) {
  const found = await db.read(
    q.selectFrom('entry').select('kind').where('accountId', '=', accountId).where('ref', '=', ref),
  )
  if (!found.length) throw new Error('Unknown movement.')
  return found
}

async function picked(db: Db, id: string) {
  if (!id) throw new Error('Choose a category.')
  await exists(db, 'category', id)
}

export async function choose(db: Db, movement: MovementKey, categoryId: string) {
  if (swap(await legs(db, movement))) throw new Error('A swap has no category.')
  await picked(db, categoryId)
  await db.write(
    q
      .insertInto('choice')
      .values({ ...movement, categoryId })
      .onConflict((oc) => oc.columns(['accountId', 'ref']).doUpdateSet({ categoryId })),
  )
}

const unchoose = ({ accountId, ref }: MovementKey) =>
  q.deleteFrom('choice').where('accountId', '=', accountId).where('ref', '=', ref)

export async function setRule(db: Db, party: string, categoryId: string, from?: MovementKey) {
  if (!party || partyOf(party) !== party) throw new Error('Unknown party.')
  await picked(db, categoryId)
  await db.write(
    q
      .insertInto('rule')
      .values({ party, categoryId, source: 'user' })
      .onConflict((oc) => oc.column('party').doUpdateSet({ categoryId, source: 'user' })),
    ...(from ? [unchoose(from)] : []),
  )
}

export async function setNote(db: Db, movement: MovementKey, body: string) {
  await legs(db, movement)
  const text = body.trim()
  await db.write(
    text
      ? q
          .insertInto('note')
          .values({ ...movement, body: text })
          .onConflict((oc) => oc.columns(['accountId', 'ref']).doUpdateSet({ body: text }))
      : q
          .deleteFrom('note')
          .where('accountId', '=', movement.accountId)
          .where('ref', '=', movement.ref),
  )
}

export type Assignable = Exclude<Movement, { kind: 'trade' }>

const assignable = async (db: Db) =>
  (await movements(db, { all: true })).filter((moved) => moved.kind !== 'trade')

export const fields = ['category', 'merchant'] as const

type Field = (typeof fields)[number]

const missingOf = (group: readonly Assignable[]): Field[] => [
  ...(group.some(({ assignment }) => assignment.state === 'open') ? (['category'] as const) : []),
  ...(group[0]?.identity.state === 'open' ? (['merchant'] as const) : []),
]

const parties = (all: readonly Assignable[]) =>
  [...Map.groupBy(all, ({ party }) => party)].filter(
    ([party, group]) => party && missingOf(group).length,
  )

export function pending(rows: readonly Movement[]) {
  const all = rows.filter((moved) => moved.kind !== 'trade')
  const alike = new Map<string, number>()
  for (const { party, assignment } of all)
    if (party && assignment.state !== 'chosen') alike.set(party, (alike.get(party) ?? 0) + 1)
  return {
    movements: parties(all).reduce((sum, [, group]) => sum + group.length, 0),
    alike,
  }
}

const linked = q.selectFrom('identity').where('merchantId', 'is not', null)

const linkedBy = (source: Source) => linked.where('source', '=', source).select('merchantId')

export async function overview(db: Db) {
  const [list, all, stored, businesses, links] = await Promise.all([
    categories(db),
    assignable(db),
    rules(db),
    merchants(db),
    db.read(linked.select(['merchantId', 'source'])),
  ])
  const byCategory = new Map<string, number>()
  const byParty = new Map<string, number>()
  const byMerchant = new Map<string, number>()
  const spentOn = new Map<string, Map<string, number>>()
  const count = (tally: Map<string, number>, key: string) =>
    tally.set(key, (tally.get(key) ?? 0) + 1)
  for (const { party, assignment, identity } of all) {
    if (assignment.state === 'chosen' || assignment.state === 'ruled')
      count(byCategory, assignment.categoryId)
    if (assignment.state === 'ruled' || assignment.state === 'unsure') count(byParty, party)
    if (identity.state !== 'linked') continue
    count(byMerchant, identity.merchantId)
    if (!('categoryId' in assignment)) continue
    const tally = spentOn.get(identity.merchantId) ?? new Map<string, number>()
    spentOn.set(identity.merchantId, count(tally, assignment.categoryId))
  }
  return {
    categories: list.map((category) => ({
      ...category,
      movements: byCategory.get(category.id) ?? 0,
      rules: stored.filter(({ categoryId }) => categoryId === category.id).length,
    })),
    rules: stored
      .map((rule) => ({ ...rule, movements: byParty.get(rule.party) ?? 0 }))
      .sort((a, b) => b.movements - a.movements || a.party.localeCompare(b.party)),
    merchants: businesses.map((merchant) => {
      const own = links.filter(({ merchantId }) => merchantId === merchant.id)
      const by: Source = own.length && own.every(({ source }) => source === 'ai') ? 'ai' : 'user'
      const main = [...(spentOn.get(merchant.id) ?? [])].sort((a, b) => b[1] - a[1])[0]
      return {
        ...merchant,
        parties: own.length,
        movements: byMerchant.get(merchant.id) ?? 0,
        categoryId: main?.[0] ?? null,
        by,
      }
    }),
  }
}

const amountOf = ({ quantity, assetId }: Assignable) =>
  `${formatUnits(quantity, scale)} ${assetId.replace(/^fiat:/, '')}`

function queue(
  all: readonly Assignable[],
  names: ReadonlyMap<string, string>,
  categoryNames: ReadonlyMap<string, string>,
  merchantNames: ReadonlyMap<string, string>,
) {
  const twins = Map.groupBy(all, ({ assetId, quantity }) => `${assetId} ${quantity}`)
  const mirrored = ({ accountId, assetId, quantity, time }: Assignable) =>
    (twins.get(`${assetId} ${-quantity}`) ?? []).some(
      (other) => other.accountId !== accountId && Math.abs(daysOf(other.time) - daysOf(time)) <= 4,
    )
  return parties(all)
    .map(([party, group]) => {
      const newest = group.toSorted((a, b) => b.time - a.time)
      const seen = new Set<string | null>()
      const samples = newest.filter(({ memo }) => !seen.has(memo) && seen.add(memo)).slice(0, 3)
      const ruled = group.find(({ assignment }) => assignment.state === 'ruled')?.assignment
      const identity = group[0]?.identity
      return {
        party,
        missing: missingOf(group),
        category: ruled?.state === 'ruled' ? (categoryNames.get(ruled.categoryId) ?? null) : null,
        merchant:
          identity?.state === 'linked' ? (merchantNames.get(identity.merchantId) ?? null) : null,
        movements: group.length,
        received: group.filter(({ quantity }) => quantity > 0n).length,
        mirrored: group.filter(mirrored).length,
        first: dayOf(newest.at(-1)?.time ?? 0),
        last: dayOf(newest[0]?.time ?? 0),
        samples: samples.map((moved) => ({
          memo: moved.memo ?? '',
          amount: amountOf(moved),
          day: dayOf(moved.time),
          account: names.get(moved.accountId) ?? '',
        })),
      }
    })
    .sort((a, b) => b.movements - a.movements || a.party.localeCompare(b.party))
}

type Answer = {
  party: string
  category?: string | null | undefined
  merchant?: { name: string; kind: string } | null | undefined
}

export const reasons = ['answered', 'unknown', 'category', 'merchant'] as const

type Skip = { party: string; field: Field; reason: (typeof reasons)[number] }

const answeredOf = ({ category, merchant }: Answer): Field[] => [
  ...(category !== undefined ? (['category'] as const) : []),
  ...(merchant !== undefined ? (['merchant'] as const) : []),
]

function accept(
  wanted: ReadonlyMap<string, readonly Field[]>,
  known: ReadonlySet<string>,
  categories: readonly { id: string; name: string }[],
  existing: ReadonlySet<string>,
  answers: readonly Answer[],
) {
  const rules: { party: string; categoryId: string | null }[] = []
  const links: { party: string; key: string | null }[] = []
  const fresh = new Map<string, { name: string; kind: MerchantKind }>()
  const skipped: Skip[] = []
  for (const answer of answers) {
    const party = partyOf(answer.party)
    for (const field of answeredOf(answer)) {
      const skip = (reason: Skip['reason']) => skipped.push({ party: answer.party, field, reason })
      const taken = field === 'category' ? rules : links
      if (!party || !known.has(party)) skip('unknown')
      else if (!wanted.get(party)?.includes(field) || taken.some((row) => row.party === party))
        skip('answered')
      else if (field === 'category') {
        const asked = answer.category?.trim().toLowerCase()
        const found = categories.find(({ name }) => name.toLowerCase() === asked)
        if (answer.category !== null && !found) skip('category')
        else rules.push({ party, categoryId: found?.id ?? null })
      } else if (answer.merchant === null) links.push({ party, key: null })
      else {
        const name = answer.merchant?.name.trim() ?? ''
        const kind = merchantKinds.find((key) => key === answer.merchant?.kind)
        const key = partyOf(name)
        if (!key) skip('merchant')
        else if (existing.has(key) || fresh.has(key)) links.push({ party, key })
        else if (!kind) skip('merchant')
        else {
          fresh.set(key, { name, kind })
          links.push({ party, key })
        }
      }
    }
  }
  return { rules, links, fresh, skipped }
}

const batch = 60

export async function categorize(db: Db, answers: readonly Answer[], now = Date.now()) {
  const [list, all, stored, accounts, businesses] = await Promise.all([
    categories(db),
    assignable(db),
    rules(db),
    db.read(q.selectFrom('account').select(['id', 'name'])),
    merchants(db),
  ])
  if (!list.length)
    throw new Error('There are no categories. Ask the user to add some in Garner, Categories.')
  const names = new Map(accounts.map(({ id, name }) => [id, name]))
  const categoryNames = new Map(list.map(({ id, name }) => [id, name]))
  const merchantNames = new Map(businesses.map(({ id, name }) => [id, name]))
  const ids = new Map(businesses.map(({ id, name }) => [partyOf(name), id]))
  const queued = queue(all, names, categoryNames, merchantNames)
  const found = accept(
    new Map(queued.map(({ party, missing }) => [party, missing])),
    new Set(all.map(({ party }) => party)),
    list,
    new Set(ids.keys()),
    answers,
  )
  const minted = [...found.fresh].map(([key, merchant]) => {
    const id = uuidv7(now)
    ids.set(key, id)
    return { id, ...merchant, updatedAt: now }
  })
  const writes = [
    ...(found.rules.length
      ? [
          q
            .insertInto('rule')
            .values(found.rules.map((rule) => ({ ...rule, source: 'ai' as const })))
            .onConflict((oc) => oc.column('party').doNothing()),
        ]
      : []),
    ...(minted.length ? [q.insertInto('merchant').values(minted)] : []),
    ...(found.links.length
      ? [
          q
            .insertInto('identity')
            .values(
              found.links.map(({ party, key }) => ({
                party,
                merchantId: key === null ? null : (ids.get(key) ?? null),
                source: 'ai' as const,
              })),
            )
            .onConflict((oc) => oc.column('party').doNothing()),
        ]
      : []),
  ]
  if (writes.length) await db.write(...writes)
  const done = (party: string, field: Field) =>
    (field === 'category' ? found.rules : found.links).some((row) => row.party === party)
  const saved = new Set([...found.rules, ...found.links].map(({ party }) => party))
  const rest = queued.flatMap((item) => {
    const missing = item.missing.filter((field) => !done(item.party, field))
    return missing.length ? [{ ...item, missing }] : []
  })
  const shown = rest.slice(0, batch)
  const left = rest.length - shown.length
  const sizes = Map.groupBy(all, ({ party }) => party)
  const ai = [...stored.filter(({ source }) => source === 'ai'), ...found.rules]
  const unsure = ai.filter(({ categoryId }) => categoryId === null).length
  const identified = new Set([
    ...all.flatMap(({ party, identity }) =>
      identity.state === 'linked' && identity.source === 'ai' ? [party] : [],
    ),
    ...found.links.flatMap(({ party, key }) => (key === null ? [] : [party])),
  ]).size
  const used = new Map<string, number>()
  const count = (merchantId: string, rows: number) =>
    used.set(merchantId, (used.get(merchantId) ?? 0) + rows)
  for (const { identity } of all) if (identity.state === 'linked') count(identity.merchantId, 1)
  for (const { party, key } of found.links) {
    const id = key === null ? undefined : ids.get(key)
    if (id) count(id, sizes.get(party)?.length ?? 0)
  }
  return {
    saved: saved.size,
    skipped: found.skipped,
    categories: list.map(({ name, type, hint }) => ({ name, type, hint })),
    kinds: [...merchantKinds],
    merchants: [...businesses, ...minted]
      .filter(({ id }) => used.has(id))
      .toSorted((a, b) => (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0))
      .slice(0, 100)
      .map(({ name, kind }) => ({ name, kind })),
    examples: stored
      .flatMap(({ party, categoryId, source }) =>
        source === 'user' && categoryId
          ? [
              {
                party,
                category: categoryNames.get(categoryId) ?? '',
                size: sizes.get(party)?.length ?? 0,
              },
            ]
          : [],
      )
      .sort((a, b) => b.size - a.size)
      .slice(0, 50)
      .map(({ party, category }) => ({ party, category })),
    accounts: [...names.values()],
    parties: shown,
    left,
    next:
      !saved.size &&
      found.skipped.length &&
      found.skipped.every(({ reason }) => reason === 'unknown')
        ? 'Nothing was saved: Garner knows none of these parties. Stop and tell the user.'
        : shown.length
          ? `Answer ${plural(shown.length, 'party', 'parties')}, then call categorize with your answers.${left ? ` ${left} more after these.` : ''}`
          : `Done: the AI categorized ${plural(ai.length - unsure, 'party', 'parties')}, was unsure of ${unsure}, and named the business behind ${identified}. Tell the user to review them in Garner, Categories.`,
  }
}

export async function clearAi(db: Db) {
  await db.write(
    q.deleteFrom('rule').where('source', '=', 'ai'),
    q
      .deleteFrom('merchant')
      .where('id', 'in', linkedBy('ai'))
      .where('id', 'not in', linkedBy('user')),
    q.deleteFrom('identity').where('source', '=', 'ai'),
  )
}

export type CategoryInput = { name: string; icon: string; type: string; hint: string }

async function checked(db: Db, { name, icon, type, hint }: CategoryInput, id = '') {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Enter a name.')
  const glyph = icons.find((key) => key === icon)
  if (!glyph) throw new Error('Choose an icon.')
  const kind = categoryTypes.find((key) => key === type)
  if (!kind) throw new Error('Choose a type.')
  const taken = await db.read(
    q.selectFrom('category').select('id').where('name', '=', trimmed).where('id', '!=', id),
  )
  if (taken.length) throw new Error('A category with this name exists.')
  return { name: trimmed, icon: glyph, type: kind, hint: hint.trim() }
}

export async function createCategory(db: Db, input: CategoryInput, now = Date.now()) {
  const category = { id: uuidv7(now), ...(await checked(db, input)), updatedAt: now }
  await db.write(q.insertInto('category').values(category))
  return category
}

export async function editCategory(db: Db, id: string, input: CategoryInput, now = Date.now()) {
  await exists(db, 'category', id)
  const fields = await checked(db, input, id)
  await db.write(
    q
      .updateTable('category')
      .set({ ...fields, updatedAt: now })
      .where('id', '=', id),
  )
}

export async function removeCategory(db: Db, id: string) {
  await exists(db, 'category', id)
  await db.write(q.deleteFrom('category').where('id', '=', id))
}

export async function forget(db: Db, party: string) {
  const found = await db.read(q.selectFrom('rule').select('party').where('party', '=', party))
  if (!found.length) throw new Error('Unknown rule.')
  await db.write(q.deleteFrom('rule').where('party', '=', party))
}

export type CategoryRow = Awaited<ReturnType<typeof overview>>['categories'][number]

export type RuleRow = Awaited<ReturnType<typeof overview>>['rules'][number]

export type MerchantRow = Awaited<ReturnType<typeof overview>>['merchants'][number]

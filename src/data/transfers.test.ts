import { expect, test } from 'bun:test'
import { parseUnits } from 'viem'
import { account, coin, institution, migrated, moved } from '../../host/fresh.ts'
import { categories, setRule } from './categories.ts'
import { movements } from './ledger.ts'
import { type CanonicalId, q } from './schema.ts'
import { months } from './spending.ts'
import {
  decide,
  forgetRoute,
  type Leg,
  legKey,
  pair,
  savedRoutes,
  saveRoute,
  undecide,
} from './transfers.ts'

const eur: CanonicalId = 'fiat:EUR'
const eth: CanonicalId = 'coingecko:ethereum'
const e = (amount: string) => parseUnits(amount, 18)
const at = (day: number, hour = 12) => Date.UTC(2026, 0, day, hour)
const leg = (
  accountId: string,
  ref: string,
  time: number,
  amount: string,
  party = '',
  asset: CanonicalId = eur,
): Leg => ({ key: { accountId, ref, leg: 'amount' }, time, asset, quantity: e(amount), party })
const stateOf = (result: Map<string, unknown>, of: Leg) => result.get(legKey(of.key))

test('twins pair on their own: the same instant and words, opposite amounts, two own accounts', () => {
  const out1 = leg('current', 'p1', at(1, 9), '-0.5', 'pocket')
  const in1 = leg('savings', 'p2', at(1, 9), '0.5', 'pocket')
  const out2 = leg('current', 'p3', at(1, 10), '-0.5', 'pocket')
  const in2 = leg('savings', 'p4', at(1, 10), '0.5', 'pocket')
  const mute = leg('current', 'p5', at(1, 11), '-0.5')
  const echo = leg('savings', 'p6', at(1, 11), '0.5')
  const legs = [in2, mute, out1, echo, in1, out2]
  const result = pair(legs, [], [])
  const pairedWith = (b: Leg) => ({
    state: 'paired',
    via: 'twin',
    with: b.key,
    sent: e('0.5'),
    received: e('0.5'),
  })
  expect(stateOf(result, out1)).toEqual(pairedWith(in1))
  expect(stateOf(result, in1)).toEqual(pairedWith(out1))
  expect(stateOf(result, out2)).toEqual(pairedWith(in2))
  expect(stateOf(result, mute)).toMatchObject({ state: 'proposed' })
  expect(pair(legs.toReversed(), [], [])).toEqual(result)
})

test('across institutions a fit is proposed, never paired: exact first, a shortfall within the bound, inside four days', () => {
  const santander = leg('san', 's1', at(1), '-100', 'trf activo')
  const activo = leg('act', 'a1', at(2), '100', 'de santander')
  const coinbase = leg('cb', 'c1', at(1), '-200', 'withdrawal')
  const revolut = leg('rev', 'r1', at(1, 15), '197', 'from coinbase')
  const late = leg('rev', 'r2', at(6), '100', 'late')
  const lost = leg('rev', 'r3', at(2), '180', 'too short')
  const sent = leg('kraken', 'k1', at(3), '-1', 'withdraw', eth)
  const arrived = leg('wallet', 'w1', at(3, 13), '0.95', '', eth)
  const dust = leg('wallet', 'w2', at(3, 14), '0.85', '', eth)
  const result = pair(
    [santander, activo, coinbase, revolut, late, lost, sent, arrived, dust],
    [],
    [],
  )
  expect(stateOf(result, santander)).toEqual({
    state: 'proposed',
    with: [{ with: activo.key, fit: 'exact' }],
  })
  expect(stateOf(result, coinbase)).toEqual({
    state: 'proposed',
    with: [{ with: revolut.key, fit: 'short' }],
  })
  expect(stateOf(result, late)).toEqual({ state: 'unmatched' })
  expect(stateOf(result, lost)).toEqual({ state: 'unmatched' })
  expect(stateOf(result, sent)).toEqual({
    state: 'proposed',
    with: [{ with: arrived.key, fit: 'short' }],
  })
  expect(stateOf(result, dust)).toEqual({ state: 'unmatched' })
})

test('the bounds are inclusive, the window is four UTC days, and a dangling decision leaves a twin alone', () => {
  const big = leg('a', 'b1', at(1), '-10000')
  const bigShort = leg('b', 'b2', at(2), '9850')
  const bigLost = leg('c', 'b3', at(2), '9849.99')
  const small = leg('a', 's1', at(5), '-20')
  const smallShort = leg('b', 's2', at(6), '19')
  const smallLost = leg('c', 's3', at(6), '18.99')
  const ether = leg('a', 'c1', at(10), '-1', '', eth)
  const tenth = leg('b', 'c2', at(10, 13), '0.9', '', eth)
  const far = leg('a', 'f1', at(20), '-300')
  const edge = leg('b', 'f2', at(24), '300')
  const tiny = leg('a', 'd1', at(26), '-0.65')
  const crumb = leg('b', 'd2', at(26), '0.01')
  const out = leg('a', 't1', at(30), '-7', 'pocket')
  const into = leg('b', 't2', at(30), '7', 'pocket')
  const result = pair(
    [
      big,
      bigShort,
      bigLost,
      small,
      smallShort,
      smallLost,
      ether,
      tenth,
      far,
      edge,
      tiny,
      crumb,
      out,
      into,
    ],
    [{ key: out.key, state: 'paired', with: { accountId: 'z', ref: 'gone', leg: 'amount' } }],
    [],
  )
  expect(stateOf(result, big)).toEqual({
    state: 'proposed',
    with: [{ with: bigShort.key, fit: 'short' }],
  })
  expect(stateOf(result, bigLost)).toEqual({ state: 'unmatched' })
  expect(stateOf(result, small)).toEqual({
    state: 'proposed',
    with: [{ with: smallShort.key, fit: 'short' }],
  })
  expect(stateOf(result, smallLost)).toEqual({ state: 'unmatched' })
  expect(stateOf(result, ether)).toEqual({
    state: 'proposed',
    with: [{ with: tenth.key, fit: 'short' }],
  })
  expect(stateOf(result, far)).toEqual({
    state: 'proposed',
    with: [{ with: edge.key, fit: 'exact' }],
  })
  expect(stateOf(result, tiny)).toEqual({ state: 'unmatched' })
  expect(stateOf(result, out)).toMatchObject({ state: 'paired', via: 'twin', with: into.key })
})

test('a decision pins both legs ahead of every tier, and external takes a leg out', () => {
  const out = leg('a', 'o', at(1), '-50', 'same')
  const twin = leg('b', 't', at(1), '50', 'same')
  const other = leg('c', 'x', at(2), '50', 'other')
  const result = pair(
    [out, twin, other],
    [
      { key: out.key, state: 'paired', with: other.key },
      { key: twin.key, state: 'external' },
    ],
    [],
  )
  expect(stateOf(result, out)).toEqual({
    state: 'paired',
    via: 'user',
    with: other.key,
    sent: e('50'),
    received: e('50'),
  })
  expect(stateOf(result, twin)).toEqual({ state: 'external' })
  expect(stateOf(result, other)).toMatchObject({ state: 'paired', via: 'user', with: out.key })
})

async function seeded() {
  const db = await migrated()
  const fee = {
    ...moved('a', eur, '2026-01-01', e('-197').toString(), 'to b'),
    leg: 'fee',
    kind: 'fee' as const,
    quantity: e('-3').toString(),
  }
  await db.write(
    q.insertInto('institution').values(institution('i')),
    q.insertInto('account').values(['a', 'b', 'c'].map((id) => account(id, 'i'))),
    q.insertInto('asset').values(coin(eur, 'EUR')),
    q.insertInto('price').values({ assetId: eur, day: '2026-01-01', usd: 1 }),
    q
      .insertInto('entry')
      .values([
        moved('a', eur, '2026-01-01', e('-197').toString(), 'to b'),
        fee,
        moved('b', eur, '2026-01-02', e('197').toString(), 'from a'),
        moved('c', eur, '2026-01-02', e('197').toString(), 'from a'),
        moved('a', eur, '2026-01-10', e('-200').toString(), 'to c'),
        moved('c', eur, '2026-01-10', e('197').toString(), 'short'),
        moved('b', eur, '2026-01-20', e('-30').toString(), 'to savings'),
      ]),
  )
  const keyOf = (accountId: string, day: string, amount: string) => ({
    accountId,
    ref: `${eur} ${day} ${e(amount)}`,
    leg: 'amount',
  })
  const transfers = async () =>
    new Map(
      (await movements(db, { all: true })).flatMap((row) =>
        row.kind === 'transfer' ? [[legKey(row.key), row.transfer] as const] : [],
      ),
    )
  return { db, keyOf, transfers }
}

test('decide pins a pair from either side, refuses a wrong pair, and undecide frees both legs', async () => {
  const { db, keyOf, transfers } = await seeded()
  const out = keyOf('a', '2026-01-01', '-197')
  const b = keyOf('b', '2026-01-02', '197')
  const c = keyOf('c', '2026-01-02', '197')
  expect((await transfers()).get(legKey(out))).toMatchObject({ state: 'proposed' })
  await expect(decide(db, { ...out, ref: 'nothing' }, { state: 'external' })).rejects.toThrow(
    'Unknown movement.',
  )
  await expect(decide(db, b, { state: 'paired', with: c })).rejects.toThrow(
    'A transfer has a sender and a receiver.',
  )
  await expect(
    decide(db, out, { state: 'paired', with: { ...out, ref: `${eur} 2026-01-10 ${e('-200')}` } }),
  ).rejects.toThrow('Choose another account.')
  await expect(decide(db, { ...out, leg: 'fee' }, { state: 'external' })).rejects.toThrow(
    'Unknown movement.',
  )
  await expect(
    decide(db, keyOf('b', '2026-01-20', '-30'), { state: 'paired', with: c }),
  ).rejects.toThrow('A transfer never gains.')
  await decide(db, c, { state: 'paired', with: out })
  expect(await db.read(q.selectFrom('decision').select(['accountId', 'peerAccountId']))).toEqual([
    { accountId: 'a', peerAccountId: 'c' },
  ])
  let state = await transfers()
  expect(state.get(legKey(out))).toMatchObject({ state: 'paired', via: 'user', with: c })
  expect(state.get(legKey(c))).toMatchObject({ state: 'paired', via: 'user', with: out })
  expect(state.get(legKey(b))).toEqual({ state: 'unmatched' })
  await decide(db, b, { state: 'external' })
  await decide(db, out, { state: 'paired', with: b })
  expect(
    await db.read(q.selectFrom('decision').select(['accountId', 'kind', 'peerAccountId'])),
  ).toEqual([{ accountId: 'a', kind: 'paired', peerAccountId: 'b' }])
  await undecide(db, b)
  await expect(undecide(db, b)).rejects.toThrow('Unknown decision.')
  state = await transfers()
  expect(state.get(legKey(out))).toMatchObject({ state: 'proposed' })
  expect(state.get(legKey(b))).toMatchObject({ state: 'proposed' })
})

test('only the first transfer leg of a movement pairs, so a refunded fee is never a candidate', async () => {
  const { db } = await seeded()
  const row = moved('b', eur, '2026-01-05', e('-20').toString(), 'card')
  await db.write(
    q
      .insertInto('entry')
      .values([
        row,
        { ...row, leg: 'fee', quantity: e('10').toString() },
        moved('c', eur, '2026-01-06', e('-10').toString(), 'elsewhere'),
      ]),
  )
  const rows = await movements(db, { accountId: 'c' })
  const other = rows.find((moved) => moved.memo === 'elsewhere')
  expect(other?.kind === 'transfer' && other.transfer).toEqual({ state: 'unmatched' })
})

test('spending counts a pair only by its fees: the fee legs and, for the sender, the shortfall', async () => {
  const { db, keyOf } = await seeded()
  const id = async (name: string) =>
    (await categories(db)).find((category) => category.name === name)?.id ?? ''
  await setRule(db, 'to savings', await id('Transfers'))
  await decide(db, keyOf('a', '2026-01-01', '-197'), {
    state: 'paired',
    with: keyOf('b', '2026-01-02', '197'),
  })
  await decide(db, keyOf('a', '2026-01-10', '-200'), {
    state: 'paired',
    with: keyOf('c', '2026-01-10', '197'),
  })
  const rows = await movements(db, { all: true })
  const { totals } = await months(db, rows)
  expect(totals['2026-01']).toEqual({ spent: 6, in: 197, out: 0, categories: { '': 6 } })
})

test('a saved route pairs exact counterparts on its own, nearest first, one direction, short ones stay proposals', () => {
  const routed = [{ fromId: 'san', toId: 'act' }]
  const out1 = leg('san', 's1', at(1), '-100', 'trf activo')
  const in1 = leg('act', 'a1', at(2), '100', 'de santander')
  const in0 = leg('act', 'a0', at(4), '100', 'later')
  const out2 = leg('san', 's2', at(10), '-200', 'trf activo')
  const in2 = leg('act', 'a2', at(10), '197', 'de santander')
  const back = leg('act', 'a3', at(20), '-50', 'to san')
  const ret = leg('san', 's3', at(20, 13), '50', 'from act')
  const legs = [in0, in1, out1, out2, in2, back, ret]
  const result = pair(legs, [], routed)
  const bound = { state: 'paired', via: 'route', sent: e('100'), received: e('100') }
  expect(stateOf(result, out1)).toEqual({ ...bound, with: in1.key })
  expect(stateOf(result, in1)).toEqual({ ...bound, with: out1.key })
  expect(stateOf(result, in0)).toEqual({ state: 'unmatched' })
  expect(stateOf(result, out2)).toEqual({
    state: 'proposed',
    with: [{ with: in2.key, fit: 'short' }],
  })
  expect(stateOf(result, back)).toEqual({
    state: 'proposed',
    with: [{ with: ret.key, fit: 'exact' }],
  })
  expect(pair(legs.toReversed(), [], routed)).toEqual(result)
  expect(stateOf(pair(legs, [], []), out1)).toMatchObject({ state: 'proposed' })
})

test('a route is saved once per direction, refuses one account, and is forgotten', async () => {
  const db = await migrated()
  await db.write(
    q.insertInto('institution').values(institution('i')),
    q.insertInto('account').values(['a', 'b'].map((id) => account(id, 'i'))),
  )
  await saveRoute(db, 'a', 'b')
  await saveRoute(db, 'a', 'b')
  await expect(saveRoute(db, 'a', 'a')).rejects.toThrow('Choose another account.')
  expect(await savedRoutes(db)).toEqual([{ fromId: 'a', toId: 'b' }])
  await forgetRoute(db, 'a', 'b')
  expect(await savedRoutes(db)).toEqual([])
})

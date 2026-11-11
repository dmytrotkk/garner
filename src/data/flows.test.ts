import { expect, test } from 'bun:test'
import { parseUnits } from 'viem'
import { flows, proposals, routes } from './flows.ts'
import type { Movement } from './ledger.ts'
import type { Transfer } from './transfers.ts'

const e = (amount: string) => parseUnits(amount, 18)
const at = (day: number) => Date.UTC(2026, 0, day, 12)

const transfer = (
  accountId: string,
  ref: string,
  time: number,
  amount: string,
  state: Transfer,
): Movement => ({
  accountId,
  ref,
  time,
  memo: 'pocket',
  assetId: 'fiat:EUR',
  quantity: e(amount),
  note: null,
  kind: 'transfer',
  key: { accountId, ref, leg: 'amount' },
  fee: 0n,
  transfer: state,
  party: 'pocket',
  assignment: { state: 'open', party: 'pocket' },
  identity: { state: 'open' },
})

const plain = (kind: 'fee' | 'income' | 'trade', amount: string): Movement => ({
  accountId: 'current',
  ref: `${kind}-1`,
  time: at(5),
  memo: kind,
  assetId: 'fiat:EUR',
  quantity: e(amount),
  note: null,
  ...(kind === 'trade'
    ? { kind }
    : {
        kind,
        party: kind,
        assignment: { state: 'open', party: kind },
        identity: { state: 'open' },
      }),
})

const paired = (
  withKey: { accountId: string; ref: string },
  sent: string,
  received: string,
): Transfer => ({
  state: 'paired',
  via: 'twin',
  with: { ...withKey, leg: 'amount' },
  sent: e(sent),
  received: e(received),
})

test('a pair is one internal edge from the sender, a proposal undecided, the rest outside, trades nothing', () => {
  const out = transfer(
    'current',
    'p1',
    at(1),
    '-100',
    paired({ accountId: 'savings', ref: 'p2' }, '100', '97'),
  )
  const back = transfer(
    'savings',
    'p2',
    at(1),
    '97',
    paired({ accountId: 'current', ref: 'p1' }, '100', '97'),
  )
  const maybe = transfer('current', 'p3', at(2), '-50', {
    state: 'proposed',
    with: [{ with: { accountId: 'activo', ref: 'a1', leg: 'amount' }, fit: 'exact' }],
  })
  const loose = transfer('current', 'p4', at(3), '-20', { state: 'unmatched' })
  const gone = transfer('current', 'p5', at(4), '-30', { state: 'external' })
  const result = flows([
    out,
    back,
    maybe,
    loose,
    gone,
    plain('fee', '-1'),
    plain('income', '500'),
    plain('trade', '-9'),
  ])
  expect(result.map(({ state }) => state)).toEqual([
    'internal',
    'undecided',
    'outside',
    'outside',
    'outside',
    'outside',
  ])
  expect(result[0]).toMatchObject({
    key: { accountId: 'current', ref: 'p1' },
    from: 'current',
    to: 'savings',
    via: 'twin',
    sent: { assetId: 'fiat:EUR', quantity: e('100') },
    received: { assetId: 'fiat:EUR', quantity: e('97') },
  })
  expect(result[1]).toMatchObject({ accountId: 'current', with: [{ fit: 'exact' }] })
  expect(result.slice(2).map((flow) => flow.state === 'outside' && flow.kind)).toEqual([
    'transfer',
    'transfer',
    'fee',
    'income',
  ])
})

test('routes group internal flows by sender, receiver and asset, most used first', () => {
  const pair = (ref: string, day: number, amount: string, to = 'savings', received = amount) =>
    transfer(
      'current',
      ref,
      at(day),
      `-${amount}`,
      paired({ accountId: to, ref: `${ref}-in` }, amount, received),
    )
  const result = routes(
    flows([
      pair('a', 1, '100'),
      pair('b', 9, '50', 'savings', '48'),
      pair('c', 3, '200', 'activo'),
      transfer('current', 'd', at(2), '-5', { state: 'unmatched' }),
    ]),
  )
  expect(result).toEqual([
    {
      from: 'current',
      to: 'savings',
      assetId: 'fiat:EUR',
      sent: e('150'),
      received: e('148'),
      count: 2,
      last: at(9),
    },
    {
      from: 'current',
      to: 'activo',
      assetId: 'fiat:EUR',
      sent: e('200'),
      received: e('200'),
      count: 1,
      last: at(3),
    },
  ])
})

test('proposals list each outgoing proposal with its first candidate, mutual first choices first', () => {
  const candidate = (accountId: string, ref: string, fit: 'exact' | 'short') => ({
    with: { accountId, ref, leg: 'amount' },
    fit,
  })
  const out = transfer('san', 'o1', at(1), '-100', {
    state: 'proposed',
    with: [candidate('act', 'i1', 'exact')],
  })
  const into = transfer('act', 'i1', at(2), '100', {
    state: 'proposed',
    with: [candidate('san', 'o1', 'exact')],
  })
  const later = transfer('san', 'o2', at(5), '-200', {
    state: 'proposed',
    with: [candidate('rev', 'i2', 'short'), candidate('act', 'i1', 'short')],
  })
  const other = transfer('rev', 'i2', at(6), '197', {
    state: 'proposed',
    with: [candidate('act', 'x', 'exact')],
  })
  const result = proposals([into, later, other, out, plain('income', '5')])
  expect(
    result.map(({ from, to, mutual, fit, sent, received, memo }) => [
      from,
      to,
      mutual,
      fit,
      sent,
      received,
      memo,
    ]),
  ).toEqual([
    ['san', 'act', true, 'exact', e('100'), e('100'), 'pocket'],
    ['san', 'rev', false, 'short', e('200'), e('197'), 'pocket'],
  ])
  expect(result[0]).toMatchObject({
    key: { accountId: 'san', ref: 'o1', leg: 'amount' },
    with: { accountId: 'act', ref: 'i1', leg: 'amount' },
    peerMemo: 'pocket',
  })
})

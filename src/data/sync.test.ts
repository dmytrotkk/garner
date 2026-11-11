import { expect, test } from 'bun:test'
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  multicall3Abi,
  numberToHex,
} from 'viem'
import { account, institution as bank, coin, fresh, moved } from '../../host/fresh.ts'
import { createEvmAccount, createManualAccount, remove, setHolding } from './accounts.ts'
import { createDb } from './db.ts'
import { gate } from './gate.ts'
import type { Provider, Reply, Transport } from './host.ts'
import { refresh } from './refresh.ts'
import { type CanonicalId, type Day, dayOf, migrations, q } from './schema.ts'
import { setCurrency, setSetting, settings } from './settings.ts'
import { sync } from './sync.ts'
import { due, listed, unlisted } from './tokens.ts'

const usdc = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const junk = '0x00000000000000000000000000000000deadbeef'
const decimalsOf: Record<string, number> = { [usdc]: 6 }
const usd: Record<string, number> = {
  'coingecko:ethereum': 2500,
  'coingecko:usd-coin': 1,
  'coingecko:glitch': -4,
}
const fx: Record<string, { past: number; days: Record<string, number> }> = {
  EUR: { past: 1.2, days: { '2026-09-21': 1.3, '2026-09-22': 1.25 } },
  GBP: { past: 1.4, days: {} },
}
const business = (time: number) => new Date(time).getUTCDay() % 6 > 0

type Institution = Record<string, { native?: bigint; tokens?: Record<string, bigint>; down?: true }>
type Call = { method: string; params: readonly [{ data: `0x${string}` }] }

const coingecko: Record<string, unknown> = {
  '/asset_platforms': [
    { id: 'ethereum', chain_identifier: 1, native_coin_id: 'ethereum' },
    { id: 'base', chain_identifier: 8453, native_coin_id: 'ethereum' },
    { id: 'solana', chain_identifier: null, native_coin_id: 'solana' },
  ],
  '/coins/markets': Array.from({ length: 250 }, (_, rank) => ({
    id: ['ethereum', 'usd-coin'][rank] ?? `coin-${rank}`,
  })),
  '/coins/list': [
    { id: 'junk', symbol: 'junk', name: 'Junk', platforms: { base: junk } },
    { id: 'ethereum', symbol: 'eth', name: 'Ethereum', platforms: {} },
    { id: 'usd-coin', symbol: 'usdc', name: 'USDC', platforms: { base: usdc, solana: 'EPjF' } },
  ],
}

const up: Institution = Object.fromEntries(
  ['ethereum', 'arbitrum-one', 'optimism', 'polygon-bor', 'bsc', 'avalanche-c-chain'].map(
    (chain) => [chain, {}],
  ),
)
const eth = 2_000_000_000_000_000_000n

function rpc(chain: Institution[string], { method, params }: Call) {
  if (method === 'eth_getBalance') return numberToHex(chain.native ?? 0n)
  const { args } = decodeFunctionData({ abi: multicall3Abi, data: params[0].data })
  const calls = args?.[0] as readonly { target: string; callData: `0x${string}` }[]
  return encodeFunctionResult({
    abi: multicall3Abi,
    functionName: 'aggregate3',
    result: calls.map(({ target, callData }) => {
      const token = target.toLowerCase()
      const { functionName } = decodeFunctionData({ abi: erc20Abi, data: callData })
      const returnData =
        functionName === 'decimals'
          ? encodeFunctionResult({ abi: erc20Abi, functionName, result: decimalsOf[token] ?? 18 })
          : encodeFunctionResult({
              abi: erc20Abi,
              functionName: 'balanceOf',
              result: chain.tokens?.[token] ?? 0n,
            })
      return { success: true, returnData }
    }),
  })
}

async function open() {
  const host = fresh()
  const db = createDb(host)
  await db.migrate(migrations)
  await db.write(
    q.insertInto('institution').values(bank('w1')),
    q
      .insertInto('account')
      .values(account('a1', 'w1', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045')),
  )
  let institution: Institution = {}
  const listings = { calls: 0, now: 0, peak: 0, delisted: false }
  const refusing = new Set<Provider>()
  const refused: Provider[] = []
  const rates: string[] = []
  const charts: string[] = []
  const spots: string[] = []
  const holes: string[] = []
  const quotes = { down: false, broken: [] as string[] }
  const flights = { now: 0, peak: 0 }
  const clock = { day: '', time: 0 }
  const landed = async () => {
    flights.peak = Math.max(flights.peak, ++flights.now)
    await Bun.sleep(0)
    flights.now--
  }
  const hooks: { onChain?: () => Promise<void> } = {}
  const ok = (body: unknown): Reply => ({ type: 'body', body })
  const status = (code: number): Reply => ({ type: 'status', status: code, retryAfter: null })
  const answer = async (provider: Provider, path: string, body: unknown): Promise<Reply> => {
    if (provider === 'coingecko') {
      listings.peak = Math.max(listings.peak, ++listings.now)
      await Bun.sleep(0)
      listings.now--
      const route = path.split('?')[0] ?? ''
      return ok(listings.delisted && route === '/coins/list' ? [] : coingecko[route])
    }
    const asked = provider === 'frankfurter' ? rates : path.startsWith('/chart/') ? charts : spots
    if (provider !== 'publicnode') asked.push(path)
    if (quotes.down && provider !== 'publicnode') throw new Error(`${provider}: offline`)
    if (provider === 'frankfurter') {
      const [range = '', query = ''] = path.slice(1).split('?')
      const base = new URLSearchParams(query).get('base') ?? ''
      if (base === 'USD') return status(422)
      const quoted = fx[base]
      if (!quoted) return status(404)
      const [from = '', to = ''] = range.split('..')
      if (range === 'latest') {
        let published = Date.parse(clock.day)
        while (!business(published)) published -= 86_400_000
        const date = dayOf(published)
        return ok({ date, rates: { USD: quoted.days[date] ?? quoted.past } })
      }
      await landed()
      let start = Date.parse(from)
      while (!business(start)) start -= 86_400_000
      const series: Record<string, { USD: number }> = {}
      for (let time = start; time <= Date.parse(to); time += 86_400_000)
        if (business(time)) series[dayOf(time)] = { USD: quoted.days[dayOf(time)] ?? quoted.past }
      return ok({ rates: series })
    }
    if (provider === 'llama' && path.startsWith('/chart/')) {
      const [ids = '', query = ''] = path.slice('/chart/'.length).split('?')
      const params = new URLSearchParams(query)
      const start = Number(params.get('start'))
      const span = Number(params.get('span'))
      if (ids.split(',').length * span > 500) return status(400)
      await landed()
      const points = Array.from({ length: span }, (_, day) => start + day * 86_400 - 5)
      if (points.some((timestamp) => quotes.broken.includes(dayOf(timestamp * 1000))))
        return status(500)
      const series = (id: string) =>
        points
          .filter((timestamp) => !holes.includes(dayOf(timestamp * 1000)))
          .map((timestamp) => ({ timestamp, price: (usd[id] ?? 0) / 2 }))
      return ok({
        coins: Object.fromEntries(
          ids.split(',').flatMap((id) => (usd[id] ? [[id, { prices: series(id) }]] : [])),
        ),
      })
    }
    if (provider === 'llama') {
      const ids = path.replace('/prices/current/', '').split(',')
      const coins = ids.flatMap((id) => (usd[id] ? [[id, { price: usd[id] }]] : []))
      return ok({ coins: Object.fromEntries(coins) })
    }
    await hooks.onChain?.()
    const chain = institution[path.slice(1)]
    return ok(chain ? { result: rpc(chain, body as Call) } : { error: { message: 'rpc down' } })
  }
  const transport: Transport = async (provider, path, body) => {
    if (provider === 'coingecko') listings.calls++
    const down =
      provider === 'publicnode' &&
      institution[path.slice(1)]?.down &&
      (body as Call).method !== 'eth_getBalance'
    if (refusing.has(provider) || down) {
      refused.push(provider)
      return { type: 'status', status: 429, retryAfter: null }
    }
    return answer(provider, path, body)
  }
  const app = { db, fetch: gate(transport, () => clock.time) }
  const run = (day: string, base: Institution[string], rest = up, hour = 12) => {
    institution = { ...rest, base }
    clock.day = day
    clock.time = Date.parse(`${day}T${hour}:00:00Z`)
    return sync(app.db, app.fetch, new Date(clock.time))
  }
  const restart = () => {
    app.db = createDb(host)
    app.fetch = gate(transport, () => clock.time)
  }
  const move = (accountId: string, assetId: CanonicalId, day: Day, quantity: bigint) =>
    db.write(
      q
        .insertInto('asset')
        .values(coin(assetId, assetId))
        .onConflict((oc) => oc.doNothing()),
      q.insertInto('entry').values(moved(accountId, assetId, day, String(quantity))),
    )
  const balances = () =>
    db.read(
      q
        .selectFrom('balance')
        .select(['assetId', 'day', 'quantity'])
        .orderBy('day')
        .orderBy('assetId'),
    )
  const prices = (assetId: CanonicalId) =>
    db.read(
      q.selectFrom('price').select(['day', 'usd']).where('assetId', '=', assetId).orderBy('day'),
    )
  return {
    db,
    fetch: app.fetch,
    run,
    restart,
    move,
    balances,
    prices,
    listings,
    refusing,
    refused,
    rates,
    charts,
    spots,
    holes,
    quotes,
    flights,
    hooks,
  }
}

test('first sync stores assets, balances and prices, the latest rate under its published day, and asks for no past day', async () => {
  const { db, run, balances, rates, charts } = await open()
  await run('2026-09-20', { native: eth, tokens: { [usdc]: 1_500_000n } })

  expect(
    await db.read(
      q.selectFrom('asset').select(['id', 'canonical', 'symbol', 'decimals']).orderBy('id'),
    ),
  ).toEqual([
    { id: 'coingecko:ethereum', canonical: 'coingecko:ethereum', symbol: 'ETH', decimals: 18 },
    { id: 'coingecko:usd-coin', canonical: 'coingecko:usd-coin', symbol: 'USDC', decimals: 18 },
    {
      id: `eip155:8453/erc20:${usdc}`,
      canonical: 'coingecko:usd-coin',
      symbol: 'USDC',
      decimals: 6,
    },
    { id: 'eip155:8453/native', canonical: 'coingecko:ethereum', symbol: 'ETH', decimals: 18 },
    { id: 'fiat:EUR', canonical: 'fiat:EUR', symbol: 'EUR', decimals: 18 },
  ])
  expect(await balances()).toEqual([
    { assetId: `eip155:8453/erc20:${usdc}`, day: '2026-09-20', quantity: '1500000' },
    { assetId: 'eip155:8453/native', day: '2026-09-20', quantity: eth.toString() },
  ])
  expect(await db.read(q.selectFrom('price').selectAll().orderBy('assetId'))).toEqual([
    { assetId: 'coingecko:ethereum', day: '2026-09-20', usd: 2500 },
    { assetId: 'coingecko:usd-coin', day: '2026-09-20', usd: 1 },
    { assetId: 'fiat:EUR', day: '2026-09-18', usd: 1.2 },
  ])
  expect([...rates, ...charts]).toEqual(['/latest?base=EUR&symbols=USD'])
  expect((await settings(db)).syncedAt).toBe(Date.parse('2026-09-20T12:00:00Z'))
})

test('prices, rates and backfill failing never fail the run, the observation is still stored', async () => {
  const { db, run, balances, quotes } = await open()
  await db.write(setSetting('currency', 'EUR'))
  quotes.down = true
  await run('2026-09-20', { native: eth })
  await run('2026-09-22', { native: eth })
  expect(await balances()).toEqual([
    { assetId: 'eip155:8453/native', day: '2026-09-20', quantity: eth.toString() },
  ])
  expect(await db.read(q.selectFrom('price').selectAll())).toEqual([])
  expect((await settings(db)).syncedAt).toBe(Date.parse('2026-09-22T12:00:00Z'))
})

test('refresh runs one sync at a time, and a request during a run or its reload queues one more', async () => {
  const { db, fetch, run, hooks } = await open()
  await run('2026-09-20', { native: eth })
  let reloads = 0
  const done = async () => {
    reloads++
    if (reloads === 1) await refresh(db, fetch, done)
  }
  const { promise, resolve } = Promise.withResolvers<void>()
  hooks.onChain = () => promise
  const first = refresh(db, fetch, done)
  await refresh(db, fetch, done)
  resolve()
  await first
  expect(reloads).toBe(2)
})

test('an account removed during the run drops out of the write', async () => {
  const { db, run, balances, hooks } = await open()
  hooks.onChain = () => remove(db, 'account', 'a1')
  await run('2026-09-20', { native: eth })
  expect(await balances()).toEqual([])
  expect(await db.read(q.selectFrom('account').select('id'))).toEqual([])
})

test('an account removed during a later run takes its assets along, the run still lands and the next one finds them again', async () => {
  const { db, run, balances, hooks } = await open()
  await run('2026-09-20', { native: eth })
  await createEvmAccount(db, 'w1', '0x71c7656ec7ab88b098defb751b7401b5f6d8976f')
  hooks.onChain = () => remove(db, 'account', 'a1')
  await run('2026-09-21', { native: eth })
  expect(await balances()).toEqual([])
  expect(await db.read(q.selectFrom('asset').select('id'))).toEqual([{ id: 'fiat:EUR' }])
  expect(await db.read(q.selectFrom('price').select('assetId').distinct())).toEqual([
    { assetId: 'fiat:EUR' },
  ])
  expect((await settings(db)).syncedAt).toBe(Date.parse('2026-09-21T12:00:00Z'))

  delete hooks.onChain
  await run('2026-09-22', { native: eth })
  expect(await balances()).toEqual([
    { assetId: 'eip155:8453/native', day: '2026-09-22', quantity: eth.toString() },
  ])
})

test('a coin whose only holder is removed during the run is stored again with the deployment the run found', async () => {
  const { db, run, move, balances, hooks } = await open()
  const exchange = await createManualAccount(db, 'w1', 'Kraken')
  await move(exchange.id, 'coingecko:usd-coin', '2026-09-20', eth)
  hooks.onChain = () => {
    delete hooks.onChain
    return remove(db, 'account', exchange.id)
  }
  await run('2026-09-21', { native: eth, tokens: { [usdc]: 1_500_000n } })
  expect((await balances()).map(({ assetId }) => assetId)).toEqual([
    `eip155:8453/erc20:${usdc}`,
    'eip155:8453/native',
  ])
})

test('the rule currency and the display currency get a rate for every past day of the history, a closed day takes the last business day', async () => {
  const { db, fetch, run, prices, rates } = await open()
  await run('2026-09-18', { native: eth })
  await run('2026-09-19', {})
  await run('2026-09-22', { native: eth })
  const latest = '/latest?base=EUR&symbols=USD'
  expect(rates).toEqual([latest, latest, latest, '/2026-09-19..2026-09-21?base=EUR&symbols=USD'])
  expect(await prices('fiat:EUR')).toEqual([
    { day: '2026-09-18', usd: 1.2 },
    { day: '2026-09-19', usd: 1.2 },
    { day: '2026-09-20', usd: 1.2 },
    { day: '2026-09-21', usd: 1.3 },
    { day: '2026-09-22', usd: 1.25 },
  ])
  expect(
    await db.read(q.selectFrom('asset').select(['symbol', 'name']).where('id', '=', 'fiat:EUR')),
  ).toEqual([{ symbol: 'EUR', name: 'Euro' }])

  await setCurrency(db, fetch, 'EUR', Date.parse('2026-09-23T08:00:00Z'))
  await run('2026-09-24', { native: eth })
  expect(rates.slice(4)).toEqual([latest, latest, '/2026-09-23..2026-09-23?base=EUR&symbols=USD'])
  expect((await prices('fiat:EUR')).slice(4)).toEqual([
    { day: '2026-09-22', usd: 1.25 },
    { day: '2026-09-23', usd: 1.2 },
    { day: '2026-09-24', usd: 1.2 },
  ])
  expect(await prices('fiat:USD')).toEqual([])
})

test('a currency first held today is priced at once, a dollar at 1 without a request', async () => {
  const { db, run, move, prices, rates } = await open()
  const bank = await createManualAccount(db, 'w1', 'Bank')
  await move(bank.id, 'fiat:GBP', '2026-09-21', 100n)
  await move(bank.id, 'fiat:USD', '2026-09-21', 100n)
  await run('2026-09-21', {})
  expect(await prices('fiat:GBP')).toEqual([{ day: '2026-09-21', usd: 1.4 }])
  expect(await prices('fiat:USD')).toEqual([{ day: '2026-09-21', usd: 1 }])
  expect(rates).toEqual(['/latest?base=EUR&symbols=USD', '/latest?base=GBP&symbols=USD'])
})

test('held fiat is priced from its first held day, an overdraft included, and a dollar is 1 without a request', async () => {
  const { db, run, move, prices, rates, charts, spots } = await open()
  const bank = await createManualAccount(db, 'w1', 'Bank')
  await move(bank.id, 'fiat:GBP', '2026-09-17', -500n)
  await move(bank.id, 'fiat:USD', '2026-09-18', 100n)
  await run('2026-09-21', {})
  await run('2026-09-22', {})
  expect((await prices('fiat:GBP')).map(({ day, usd }) => `${day} ${usd}`)).toEqual([
    '2026-09-17 1.4',
    '2026-09-18 1.4',
    '2026-09-19 1.4',
    '2026-09-20 1.4',
    '2026-09-21 1.4',
    '2026-09-22 1.4',
  ])
  expect((await prices('fiat:USD')).map(({ day, usd }) => `${day} ${usd}`)).toEqual([
    '2026-09-18 1',
    '2026-09-19 1',
    '2026-09-20 1',
    '2026-09-21 1',
    '2026-09-22 1',
  ])
  expect(rates).toEqual([
    '/latest?base=EUR&symbols=USD',
    '/latest?base=GBP&symbols=USD',
    '/2026-09-17..2026-09-20?base=EUR&symbols=USD',
    '/2026-09-17..2026-09-20?base=GBP&symbols=USD',
    '/latest?base=EUR&symbols=USD',
    '/latest?base=GBP&symbols=USD',
  ])
  expect([...charts, ...spots]).toEqual([])
})

test('an asset no provider serves is never requested', async () => {
  const { db, run, move, prices, rates, charts, spots } = await open()
  const broker = await createManualAccount(db, 'w1', 'Broker')
  const stock = 'ticker:XYZ' as CanonicalId
  await move(broker.id, stock, '2026-09-17', 1n)
  await run('2026-09-21', {})
  await run('2026-09-22', {})
  expect([...rates, ...charts, ...spots].join()).not.toContain('XYZ')
  expect(await prices(stock)).toEqual([])
})

test('a long gap is asked per asset in windows of at most 500 days, five at a time, and a failed window is retried alone', async () => {
  const { db, run, move, prices, charts, quotes, flights } = await open()
  const exchange = await createManualAccount(db, 'w1', 'Kraken')
  await move(exchange.id, 'coingecko:ethereum', '2023-06-01', eth)
  await move(exchange.id, 'coingecko:usd-coin', '2023-06-01', eth)
  quotes.broken.push('2025-01-01')
  await run('2026-09-21', {})
  expect(charts).toHaveLength(6)
  expect(flights.peak).toBe(5)
  expect(charts.filter((path) => path.includes(','))).toEqual([])
  const newest = Date.parse('2026-09-21T12:00:00Z') / 1000 - 499 * 86_400
  expect(charts).toContain(`/chart/coingecko:ethereum?start=${newest}&span=499&period=1d`)
  const stored = (await prices('coingecko:ethereum')).map(({ day }) => day)
  expect(stored).toContain('2023-06-01')
  expect(stored).toContain('2026-09-20')
  expect(stored).not.toContain('2025-01-01')

  quotes.broken.length = 0
  await run('2026-09-21', {}, up, 13)
  await run('2026-09-21', {}, up, 14)
  expect(charts).toHaveLength(8)
  const days = (Date.parse('2026-09-21') - Date.parse('2023-06-01')) / 86_400_000 + 1
  expect(await prices('coingecko:ethereum')).toHaveLength(days)
  expect(await prices('coingecko:usd-coin')).toHaveLength(days)
  expect(await prices('fiat:EUR')).toHaveLength(days)
})

test('a provider that is down costs five requests for past days, then the run stops asking and the next one starts over', async () => {
  const { db, run, move, prices, rates, charts, quotes } = await open()
  const exchange = await createManualAccount(db, 'w1', 'Kraken')
  await move(exchange.id, 'coingecko:ethereum', '2020-01-01', eth)
  await move(exchange.id, 'coingecko:usd-coin', '2020-01-01', eth)
  quotes.down = true
  await run('2026-09-21', {})
  expect(rates.filter((path) => path.includes('..')).length + charts.length).toBe(5)
  expect(await prices('coingecko:ethereum')).toEqual([])

  quotes.down = false
  await run('2026-09-21', {}, up, 13)
  const days = (Date.parse('2026-09-21') - Date.parse('2020-01-01')) / 86_400_000 + 1
  expect(await prices('coingecko:ethereum')).toHaveLength(days)
  expect(await prices('fiat:EUR')).toHaveLength(days)
})

test('twenty years of imported history are priced by one run, a currency in one request', async () => {
  const { db, run, move, prices, rates } = await open()
  const exchange = await createManualAccount(db, 'w1', 'Kraken')
  await move(exchange.id, 'coingecko:ethereum', '2005-01-03', eth)
  await move(exchange.id, 'coingecko:usd-coin', '2005-01-03', eth)
  await run('2026-09-21', {})
  expect(rates).toEqual([
    '/latest?base=EUR&symbols=USD',
    '/2005-01-03..2026-09-20?base=EUR&symbols=USD',
  ])
  const days = (Date.parse('2026-09-21') - Date.parse('2005-01-03')) / 86_400_000 + 1
  expect(await prices('coingecko:ethereum')).toHaveLength(days)
  expect(await prices('coingecko:usd-coin')).toHaveLength(days)
  expect(await prices('fiat:EUR')).toHaveLength(days)
})

test('a negative price is left out, asked once per app run, and the rest of the run is stored', async () => {
  const { db, run, move, prices, charts } = await open()
  const exchange = await createManualAccount(db, 'w1', 'Kraken')
  await move(exchange.id, 'coingecko:glitch', '2026-09-20', eth)
  await run('2026-09-22', { native: eth })
  await run('2026-09-22', { native: eth }, up, 13)
  expect(charts).toEqual([
    `/chart/coingecko:glitch?start=${Date.parse('2026-09-20T12:00:00Z') / 1000}&span=2&period=1d`,
  ])
  expect(await prices('coingecko:glitch')).toEqual([])
  expect(await prices('coingecko:ethereum')).toEqual([{ day: '2026-09-22', usd: 2500 }])
})

test('a second sync on the same day replaces the spot price', async () => {
  const { run, prices } = await open()
  await run('2026-09-20', { native: eth })
  usd['coingecko:ethereum'] = 3000
  await run('2026-09-20', { native: eth }, up, 13)
  usd['coingecko:ethereum'] = 2500
  expect(await prices('coingecko:ethereum')).toEqual([{ day: '2026-09-20', usd: 3000 }])
})

test('a coin the chart does not know is asked once per app run and ends no lane', async () => {
  const { db, run, move, prices, charts } = await open()
  const exchange = await createManualAccount(db, 'w1', 'Kraken')
  await move(exchange.id, 'coingecko:unlisted', '2026-09-18', eth)
  await move(exchange.id, 'coingecko:ethereum', '2026-09-18', eth)
  await run('2026-09-21', {})
  await run('2026-09-21', {}, up, 13)
  expect(charts.filter((path) => path.includes('unlisted'))).toHaveLength(1)
  expect(await prices('coingecko:unlisted')).toEqual([])
  expect(await prices('coingecko:ethereum')).toHaveLength(4)
})

test('past days of a run whose write failed are asked again', async () => {
  const { db, run, prices, charts } = await open()
  await run('2026-09-20', { native: eth })
  const { write } = db
  db.write = () => Promise.reject(new Error('disk full'))
  await expect(run('2026-09-24', { native: eth })).rejects.toThrow('disk full')
  db.write = write
  await run('2026-09-24', { native: eth }, up, 13)
  expect(charts).toHaveLength(2)
  expect(await prices('coingecko:ethereum')).toHaveLength(5)
})

test('days without a sync get their prices backfilled once, only while the asset was held', async () => {
  const { run, prices, charts } = await open()
  await run('2026-09-20', { native: eth, tokens: { [usdc]: 1_500_000n } })
  await run('2026-09-21', { native: eth })
  expect(charts).toEqual([])

  await run('2026-09-24', { native: eth })
  expect(charts).toEqual([
    `/chart/coingecko:ethereum?start=${Date.parse('2026-09-22T12:00:00Z') / 1000}&span=2&period=1d`,
  ])
  expect(await prices('coingecko:ethereum')).toEqual([
    { day: '2026-09-20', usd: 2500 },
    { day: '2026-09-21', usd: 2500 },
    { day: '2026-09-22', usd: 1250 },
    { day: '2026-09-23', usd: 1250 },
    { day: '2026-09-24', usd: 2500 },
  ])
  expect(await prices('coingecko:usd-coin')).toEqual([{ day: '2026-09-20', usd: 1 }])

  await run('2026-09-25', { native: eth })
  expect(charts).toHaveLength(1)
})

test('a day the chart never fills is asked once per app run', async () => {
  const { run, restart, prices, charts, holes } = await open()
  await run('2026-09-20', { native: eth })
  holes.push('2026-09-22')
  await run('2026-09-24', { native: eth })
  expect(charts).toHaveLength(1)
  expect((await prices('coingecko:ethereum')).map(({ day }) => day)).toEqual([
    '2026-09-20',
    '2026-09-21',
    '2026-09-23',
    '2026-09-24',
  ])
  await run('2026-09-25', { native: eth })
  expect(charts).toHaveLength(1)

  restart()
  await run('2026-09-25', { native: eth }, up, 13)
  await run('2026-09-25', { native: eth }, up, 14)
  expect(charts.slice(1)).toEqual([
    `/chart/coingecko:ethereum?start=${Date.parse('2026-09-22T12:00:00Z') / 1000}&span=1&period=1d`,
  ])
})

test('a token outside the top coins by market cap is never tracked', async () => {
  const { db, run, balances } = await open()
  await run('2026-09-20', { native: eth, tokens: { [junk]: 5n } })
  expect(await balances()).toHaveLength(1)
  expect(await db.read(q.selectFrom('token').select('coin').where('coin', '=', 'junk'))).toEqual([])
})

test('an unchanged holding writes no row, a changed one a new row, a vanished one a single zero row', async () => {
  const { run, balances } = await open()
  await run('2026-09-20', { native: eth, tokens: { [usdc]: 1_500_000n } })
  await run('2026-09-21', { native: eth, tokens: { [usdc]: 1_500_000n } })
  await run('2026-09-22', { native: 1n })
  await run('2026-09-23', {})
  await run('2026-09-24', {})

  expect(await balances()).toEqual([
    { assetId: `eip155:8453/erc20:${usdc}`, day: '2026-09-20', quantity: '1500000' },
    { assetId: 'eip155:8453/native', day: '2026-09-20', quantity: eth.toString() },
    { assetId: `eip155:8453/erc20:${usdc}`, day: '2026-09-22', quantity: '0' },
    { assetId: 'eip155:8453/native', day: '2026-09-22', quantity: '1' },
    { assetId: 'eip155:8453/native', day: '2026-09-23', quantity: '0' },
  ])
})

test('a coin held only through movements is priced like a typed one, from its first held day', async () => {
  const { db, run, move, prices, charts } = await open()
  await db.write(q.deleteFrom('account'))
  const exchange = await createManualAccount(db, 'w1', 'Kraken')
  const ether = 'coingecko:ethereum' as const
  await move(exchange.id, ether, '2026-09-18', eth)
  await run('2026-09-21', {})
  await run('2026-09-24', {})
  const noon = (day: string) => Date.parse(`${day}T12:00:00Z`) / 1000
  expect(charts).toEqual([
    `/chart/${ether}?start=${noon('2026-09-18')}&span=3&period=1d`,
    `/chart/${ether}?start=${noon('2026-09-22')}&span=2&period=1d`,
  ])
  expect(await prices(ether)).toEqual([
    { day: '2026-09-18', usd: 1250 },
    { day: '2026-09-19', usd: 1250 },
    { day: '2026-09-20', usd: 1250 },
    { day: '2026-09-21', usd: 2500 },
    { day: '2026-09-22', usd: 1250 },
    { day: '2026-09-23', usd: 1250 },
    { day: '2026-09-24', usd: 2500 },
  ])
})

test('a run that read the chain earlier never replaces a newer observation, and is compared with what came before it', async () => {
  const { db, run } = await open()
  const stored = () => db.read(q.selectFrom('balance').select(['time', 'quantity']).orderBy('time'))
  const noon = Date.parse('2026-09-20T12:00:00Z')
  await run('2026-09-20', { native: eth })
  await run('2026-09-20', { native: 1n }, up, 11)
  expect(await stored()).toEqual([{ time: noon, quantity: eth.toString() }])
  await run('2026-09-20', { native: 1n }, up, 13)
  expect(await stored()).toEqual([{ time: noon + 3_600_000, quantity: '1' }])
  await run('2026-09-19', { native: 1n })
  expect(await stored()).toEqual([
    { time: noon - 86_400_000, quantity: '1' },
    { time: noon + 3_600_000, quantity: '1' },
  ])
})

test('the token list is fetched once a week, one request at a time, and a refused refresh costs one request while the stale list still works', async () => {
  const { run, balances, listings, refusing } = await open()
  await run('2026-09-20', { native: eth })
  await run('2026-09-21', { native: eth })
  expect(listings.calls).toBe(6)
  expect(listings.peak).toBe(1)

  refusing.add('coingecko')
  await run('2026-09-30', { native: 1n })
  expect(listings.calls).toBe(7)
  expect(await balances()).toHaveLength(2)
})

test('a refused list refresh waits an hour, across a relaunch, then two, and a loaded list clears the wait', async () => {
  const { db, run, restart, listings, refusing } = await open()
  await run('2026-09-20', { native: eth })
  refusing.add('coingecko')
  await run('2026-09-30', { native: eth })
  expect((await settings(db)).coinListFailure).toEqual({
    count: 1,
    at: Date.parse('2026-09-30T12:00:00Z'),
  })
  restart()
  await run('2026-09-30', { native: eth }, up, 12)
  expect(listings.calls).toBe(7)
  await run('2026-09-30', { native: eth }, up, 13)
  expect(listings.calls).toBe(8)
  await run('2026-09-30', { native: eth }, up, 14)
  expect(listings.calls).toBe(8)
  refusing.delete('coingecko')
  await run('2026-09-30', { native: eth }, up, 15)
  expect(listings.calls).toBe(14)
  expect((await settings(db)).coinListFailure).toBeNull()
})

test('a first sync without a token list fails plainly, asks once, and asks again only after the pause', async () => {
  const { db, run, listings, refusing } = await open()
  refusing.add('coingecko')
  await expect(run('2026-09-20', { native: eth })).rejects.toThrow(unlisted)
  expect(listings.calls).toBe(1)
  expect((await settings(db)).coinListFailure).toBeNull()
  await expect(run('2026-09-20', { native: eth })).rejects.toThrow(unlisted)
  expect(listings.calls).toBe(1)
  await expect(run('2026-09-20', { native: eth }, up, 13)).rejects.toThrow(unlisted)
  expect(listings.calls).toBe(2)
})

test('a sixth refused list refresh waits a day, not more', () => {
  const hour = 3_600_000
  const at = Date.parse('2026-09-30T12:00:00Z')
  const seenAt = at - 168 * hour
  expect(due(seenAt, { count: 6, at }, at + 24 * hour - 1)).toBe(false)
  expect(due(seenAt, { count: 6, at }, at + 24 * hour)).toBe(true)
})

test('a limited chain fails the whole sync with the reason, zeroes nothing, and its retries stay local', async () => {
  const { run, balances, refused } = await open()
  await run('2026-09-20', { native: eth, tokens: { [usdc]: 1_500_000n } })
  await expect(run('2026-09-21', { native: eth, down: true })).rejects.toThrow(
    /^PublicNode is limiting requests\. Try again in 1 minute\.$/,
  )
  expect(await balances()).toHaveLength(2)
  expect(refused).toEqual(['publicnode'])
  await expect(run('2026-09-21', { native: eth })).rejects.toThrow(/^PublicNode/)
  expect(refused).toEqual(['publicnode'])
})

test('a limited price source is asked once, the run still lands, and the next one fills the days', async () => {
  const { db, run, move, prices, refusing, refused } = await open()
  const exchange = await createManualAccount(db, 'w1', 'Kraken')
  await move(exchange.id, 'coingecko:ethereum', '2020-01-01', eth)
  refusing.add('llama')
  await run('2026-09-21', {})
  expect((await settings(db)).syncedAt).toBe(Date.parse('2026-09-21T12:00:00Z'))
  expect(await prices('coingecko:ethereum')).toEqual([])
  expect(refused).toEqual(['llama'])

  refusing.delete('llama')
  await run('2026-09-21', {}, up, 13)
  const days = (Date.parse('2026-09-21') - Date.parse('2020-01-01')) / 86_400_000 + 1
  expect(await prices('coingecko:ethereum')).toHaveLength(days)
})

test('a held token that leaves the list is still read from chain, never zeroed by the list', async () => {
  const { run, balances, listings } = await open()
  await run('2026-09-20', { native: eth, tokens: { [usdc]: 1_500_000n } })
  listings.delisted = true
  await run('2026-09-30', { native: eth, tokens: { [usdc]: 1_500_000n } })
  expect(await balances()).toHaveLength(2)
  await run('2026-10-01', { native: eth })
  expect((await balances()).at(-1)).toEqual({
    assetId: `eip155:8453/erc20:${usdc}`,
    day: '2026-10-01',
    quantity: '0',
  })
})

test('one unreachable chain fails the whole sync and writes nothing', async () => {
  const { db, run, balances } = await open()
  await expect(run('2026-09-20', { native: eth }, {})).rejects.toThrow('rpc down')
  expect(await balances()).toEqual([])
  expect((await settings(db)).syncedAt).toBeNull()
})

test('the token list carries every top coin, ranked, and manual holdings are priced without any address', async () => {
  const { db, run, prices } = await open()
  await db.write(q.deleteFrom('account'))
  const manual = await createManualAccount(db, 'w1', 'Coinbase')
  await run('2026-09-20', {})
  expect((await db.read(listed)).map(({ id }) => id)).toEqual([
    'coingecko:ethereum',
    'coingecko:usd-coin',
  ])

  await setHolding(
    db,
    manual.id,
    'coingecko:ethereum',
    '2',
    undefined,
    Date.parse('2026-09-20T12:00:00Z'),
  )
  await run('2026-09-21', {})
  expect(await prices('coingecko:ethereum')).toEqual([
    { day: '2026-09-20', usd: 1250 },
    { day: '2026-09-21', usd: 2500 },
  ])
})

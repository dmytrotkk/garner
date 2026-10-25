import { expect, test } from 'bun:test'
import { gate } from './gate'
import type { Provider, Reply, Transport } from './host'

const start = Date.parse('2026-10-18T12:00:00Z')

function open(replies: Partial<Record<Provider, () => Reply | Promise<Reply>>> = {}) {
  const clock = { time: start }
  const asked: Provider[] = []
  const transport: Transport = async (provider) => {
    asked.push(provider)
    return (replies[provider] ?? (() => ({ type: 'body', body: provider })))()
  }
  return { fetch: gate(transport, () => clock.time), clock, asked }
}

const limited = (retryAfter: string | null): Reply => ({ type: 'status', status: 429, retryAfter })

test('a refusal pauses only its provider, for its Retry-After, without asking it again', async () => {
  const { fetch, clock, asked } = open({ llama: () => limited('120') })
  await expect(fetch('llama', '/prices')).rejects.toThrow(
    'DefiLlama is limiting requests. Try again in 2 minutes.',
  )
  clock.time += 60_000
  await expect(fetch('llama', '/prices')).rejects.toThrow('Try again in 1 minute.')
  expect(await fetch('frankfurter', '/latest')).toBe('frankfurter')
  expect(asked).toEqual(['llama', 'frankfurter'])
  clock.time += 60_000
  await expect(fetch('llama', '/prices')).rejects.toThrow('in 2 minutes')
  expect(asked).toEqual(['llama', 'frankfurter', 'llama'])
})

test('Retry-After is read as seconds or a date, at least a minute and at most a day', async () => {
  const wait = async (retryAfter: string | null) => {
    const { fetch } = open({ llama: () => limited(retryAfter) })
    const refusal = await fetch('llama', '/prices').catch((error: Error) => error.message)
    return String(refusal).replace(/^DefiLlama is limiting requests\. /, '')
  }
  expect(await wait(new Date(start + 600_000).toUTCString())).toBe('Try again in 10 minutes.')
  for (const value of [null, '0', 'soon', '-5', new Date(start - 600_000).toUTCString()])
    expect(await wait(value)).toBe('Try again in 1 minute.')
  for (const value of ['999999', '9'.repeat(400)])
    expect(await wait(value)).toBe('Try again in 1,440 minutes.')
  const { fetch, asked } = open({
    frankfurter: () => ({ type: 'status', status: 503, retryAfter: null }),
  })
  await expect(fetch('frankfurter', '/latest')).rejects.toThrow('Frankfurter is unavailable.')
  await expect(fetch('frankfurter', '/latest')).rejects.toThrow(
    'Frankfurter is unavailable. Try again in 1 minute.',
  )
  expect(asked).toEqual(['frankfurter'])
})

test('a later or shorter answer never shortens or lifts a pause', async () => {
  const pending: ((reply: Reply) => void)[] = []
  const { fetch, clock } = open({
    publicnode: () =>
      pending.length < 3
        ? new Promise((resolve) => pending.push(resolve))
        : { type: 'body', body: 'asked' },
  })
  const first = fetch('publicnode', '/base').catch(() => 'refused')
  const second = fetch('publicnode', '/base').catch(() => 'refused')
  const third = fetch('publicnode', '/base')
  pending[0]?.(limited('300'))
  pending[1]?.(limited('30'))
  pending[2]?.({ type: 'body', body: 'late' })
  expect([await first, await second, await third]).toEqual(['refused', 'refused', 'late'])
  clock.time += 60_000
  await expect(fetch('publicnode', '/base')).rejects.toThrow('Try again in 4 minutes.')
})

test('other statuses fail plainly without a pause, and thrown errors and bodies pass through', async () => {
  const { fetch, asked } = open({
    llama: () => ({ type: 'status', status: 404, retryAfter: null }),
    coingecko: () => Promise.reject(new Error('coingecko: offline')),
  })
  await expect(fetch('llama', '/chart')).rejects.toThrow('DefiLlama answered 404.')
  await expect(fetch('llama', '/chart')).rejects.toThrow('DefiLlama answered 404.')
  await expect(fetch('coingecko', '/coins/list')).rejects.toThrow('coingecko: offline')
  expect(await fetch('frankfurter', '/latest')).toBe('frankfurter')
  expect(asked).toEqual(['llama', 'llama', 'coingecko', 'frankfurter'])
})

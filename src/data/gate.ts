import type { Fetch, Provider, Transport } from './host'

type Pause = { reason: 'is limiting requests' | 'is unavailable'; until: number }

const names: Record<Provider, string> = {
  coingecko: 'CoinGecko',
  frankfurter: 'Frankfurter',
  llama: 'DefiLlama',
  publicnode: 'PublicNode',
}

const minute = 60_000
const day = 1440 * minute
const relative = new Intl.RelativeTimeFormat('en-US')

const resume = (retryAfter: string | null, now: number) => {
  const at = !retryAfter
    ? 0
    : /^\d+$/.test(retryAfter)
      ? now + Number(retryAfter) * 1000
      : Date.parse(retryAfter)
  return Math.min(Math.max(now + minute, at || 0), now + day)
}

const refused = (provider: Provider, { reason, until }: Pause, now: number) =>
  new Error(
    `${names[provider]} ${reason}. Try again ${relative.format(Math.ceil((until - now) / minute), 'minute')}.`,
  )

export function gate(transport: Transport, clock = Date.now): Fetch {
  const pauses = new Map<Provider, Pause>()
  return async (provider, path, body) => {
    const held = pauses.get(provider)
    if (held && clock() < held.until) throw refused(provider, held, clock())
    const reply = await transport(provider, path, body)
    if (reply.type === 'body') return reply.body
    const { status, retryAfter } = reply
    const reason =
      status === 429 ? 'is limiting requests' : status === 503 ? 'is unavailable' : null
    if (!reason) throw new Error(`${names[provider]} answered ${status}.`)
    const now = clock()
    const until = Math.max(resume(retryAfter, now), pauses.get(provider)?.until ?? 0)
    const pause: Pause = { reason, until }
    pauses.set(provider, pause)
    throw refused(provider, pause, now)
  }
}

import type { Provider, Transport } from '../src/data/host'

const providers: Record<Provider, (path: string) => string> = {
  coingecko: (path) => `https://api.coingecko.com/api/v3${path}`,
  frankfurter: (path) => `https://api.frankfurter.dev/v1${path}`,
  llama: (path) => `https://coins.llama.fi${path}`,
  publicnode: (path) => {
    const chain = /^\/([a-z0-9-]+)$/.exec(path)?.[1]
    if (!chain) throw new TypeError(`invalid chain: ${path}`)
    return `https://${chain}-rpc.publicnode.com`
  },
}

export const fetchProvider: Transport = async (provider, path, body) => {
  if (!path.startsWith('/')) throw new TypeError(`invalid path: ${path}`)
  const res = await fetch(providers[provider](path), {
    signal: AbortSignal.timeout(30_000),
    ...(body != null && {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })
  if (!res.ok)
    return { type: 'status', status: res.status, retryAfter: res.headers.get('retry-after') }
  return { type: 'body', body: await res.json() }
}

import type { Icon } from '../src/data/host.ts'

const deployment = /^\d+\/0x[0-9a-f]{40}$/i

export const icon: Icon = async (coin, source) => {
  if (!/^[\w-]+$/.test(coin)) throw new TypeError(`invalid coin: ${coin}`)
  const path = `data/icons/${coin}.webp`
  const cached = Bun.file(path)
  if (await cached.exists()) return cached.size ? cached.bytes() : null
  if (!source || !deployment.test(source)) return null
  const url = `https://token-icons.llamao.fi/icons/tokens/${source}?h=96&w=96`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null)
  if (res?.ok) {
    const bytes = await res.bytes()
    await Bun.write(path, bytes)
    return bytes
  }
  if (res && (res.status === 404 || res.status === 410)) await Bun.write(path, new Uint8Array())
  return null
}

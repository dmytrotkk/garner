import type { Host } from '../host.ts'

const call =
  (method: Exclude<keyof Host, 'icon'>) =>
  async (...args: unknown[]) => {
    const res = await fetch(`/host/${method}`, { method: 'POST', body: JSON.stringify(args) })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

export const http: Host = {
  query: call('query'),
  batch: call('batch'),
  migrate: call('migrate'),
  backup: call('backup'),
  transport: call('transport'),
  icon: async (coin, source) => {
    const query = source ? `?source=${encodeURIComponent(source)}` : ''
    const res = await fetch(`/host/icons/${coin}${query}`)
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
  },
  links: call('links'),
  address: call('address'),
}

export const changes = (listener: () => void) => {
  new EventSource('/host/events').onmessage = listener
}

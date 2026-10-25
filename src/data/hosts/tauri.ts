import { Channel, invoke } from '@tauri-apps/api/core'
import type { Frame, Host, Relay } from '../host'

const call = <Result>(command: string, args: Record<string, unknown> = {}) =>
  invoke<Result>(command, args).catch((reason) => {
    throw new Error(String(reason))
  })

type Menu = (
  entries: readonly { label: string; symbol: string; separated: boolean }[],
  at: { x: number; y: number },
  pick: (index: number) => void,
) => Promise<void>

export const tauri: Host & Relay & { menu: Menu } = {
  query: (statement) => call('query', { statement }),
  batch: (statements) => call('batch', { statements }),
  migrate: (statements) => call('migrate', { statements }),
  backup: (version) => call('backup', { version }),
  transport: (provider, path, body) => call('fetch', { provider, path, body }),
  icon: async (coin, source) => {
    const bytes = new Uint8Array(await call<ArrayBuffer>('icon', { coin, source }))
    return bytes.length ? bytes : null
  },
  links: (connect) => call('links', { connect }),
  address: () => call('address'),
  clients: (listener) => {
    const channel = new Channel<Frame>()
    channel.onmessage = listener
    return call('mcp_listen', { channel })
  },
  reply: (id, line) => call('mcp_reply', { id, line }),
  menu: (entries, { x, y }, pick) => {
    const channel = new Channel<number>()
    channel.onmessage = pick
    return call('menu', { entries, x, y, pick: channel })
  },
}

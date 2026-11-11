import {
  deserializeMessage,
  type McpServerFactory,
  type Transport,
} from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import type { Relay } from '../data/host.ts'

export function serve({ clients, reply }: Relay, factory: McpServerFactory) {
  const open = new Map<number, Transport>()
  return clients((frame) => {
    if (frame.type === 'open') {
      const transport: Transport = {
        start: async () => {},
        send: (message) => reply(frame.id, JSON.stringify(message)),
        close: async () => transport.onclose?.(),
      }
      open.set(frame.id, transport)
      serveStdio(factory, { transport, onerror: (error) => console.error(error) })
    } else if (frame.type === 'line') {
      const transport = open.get(frame.id)
      try {
        transport?.onmessage?.(deserializeMessage(frame.line))
      } catch (error) {
        transport?.onerror?.(error instanceof Error ? error : new Error(String(error)))
      }
    } else {
      open.get(frame.id)?.close()
      open.delete(frame.id)
    }
  })
}

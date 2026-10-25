import { expect, spyOn, test } from 'bun:test'
import { migrated } from '../../host/fresh'
import type { Frame, Relay } from '../data/host'
import { serve } from './serve'
import { server } from './server'

type Tool = { name: string; _meta?: { ui?: { resourceUri: string } } }
type Result = Record<string, unknown> & { tools?: Tool[]; content?: { text: string }[] }
type Reply = { id?: number; result?: Result }

async function open() {
  const db = await migrated()
  const replies: { connection: number; reply: Reply }[] = []
  const waiting = new Map<number, (reply: Reply) => void>()
  let listener = (_frame: Frame) => {}
  let changes = 0
  const relay: Relay = {
    clients: async (next) => {
      listener = next
    },
    reply: async (connection, line) => {
      const reply: Reply = JSON.parse(line)
      replies.push({ connection, reply })
      if (reply.id !== undefined) waiting.get(reply.id)?.(reply)
    },
  }
  const sources = { card: async () => '<html>card</html>', icon: async () => null }
  const fetch = async () => {
    throw new Error('offline')
  }
  await serve(relay, () =>
    server({ db, fetch }, sources, () => {
      changes += 1
    }),
  )
  let next = 0
  const request = (connection: number, method: string, params: object = {}) => {
    const id = ++next
    const answered = new Promise<Reply>((resolve) => waiting.set(id, resolve))
    listener({
      id: connection,
      type: 'line',
      line: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })
    return answered
  }
  const connect = async (connection: number, capabilities: object) => {
    listener({ id: connection, type: 'open' })
    const client = { name: 'test', version: '1' }
    const params = { protocolVersion: '2025-06-18', capabilities, clientInfo: client }
    const { result } = await request(connection, 'initialize', params)
    listener({
      id: connection,
      type: 'line',
      line: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
    return result
  }
  return {
    listener: (frame: Frame) => listener(frame),
    request,
    connect,
    replies,
    changes: () => changes,
  }
}

const ui = {
  extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
}

test('a client behind the relay initializes, lists tools, writes and reads a card', async () => {
  const { connect, request, replies, changes } = await open()
  expect(await connect(1, ui)).toMatchObject({ serverInfo: { name: 'garner' } })

  const listed = await request(1, 'tools/list')
  const portfolio = listed.result?.tools?.find(({ name }) => name === 'portfolio')
  const uri = portfolio?._meta?.ui?.resourceUri ?? ''
  expect(uri).toMatch(/^ui:\/\/garner\/portfolio\.[0-9a-f]{12}\.html$/)

  const added = await request(1, 'tools/call', {
    name: 'add_institution',
    arguments: { name: 'Cold' },
  })
  expect(added.result).toMatchObject({ structuredContent: { name: 'Cold' } })
  expect(changes()).toBe(1)

  const shown = await request(1, 'tools/call', { name: 'portfolio', arguments: {} })
  expect(shown.result).toMatchObject({
    content: [{ text: expect.stringContaining('Shown to the user as a card') }],
    structuredContent: { institutions: [{ name: 'Cold' }] },
    _meta: { icons: {} },
  })
  expect(changes()).toBe(1)

  const read = await request(1, 'resources/read', { uri })
  expect(read.result).toMatchObject({ contents: [{ uri, text: '<html>card</html>' }] })
  expect(replies.every(({ connection }) => connection === 1)).toBe(true)
})

test('a client without the card extension gets the numbers as text, per connection', async () => {
  const { connect, request, listener, replies } = await open()
  await connect(1, ui)
  await connect(2, {})
  const plain = await request(2, 'tools/call', { name: 'portfolio', arguments: {} })
  expect(JSON.parse(plain.result?.content?.[0]?.text ?? '')).toMatchObject({ institutions: [] })
  expect(plain.result?._meta).toBeUndefined()

  const reported = spyOn(console, 'error').mockImplementation(() => {})
  listener({ id: 2, type: 'line', line: 'not json' })
  expect(reported).toHaveBeenCalledTimes(1)
  reported.mockRestore()
  listener({ id: 9, type: 'line', line: '{}' })
  listener({ id: 2, type: 'close' })
  const before = replies.length
  listener({
    id: 2,
    type: 'line',
    line: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'ping' }),
  })
  expect((await request(1, 'ping')).result).toEqual({})
  expect(replies.slice(before).every(({ connection }) => connection === 1)).toBe(true)
})

test('a 2026-07-28 client declares the card extension per request and is shown the card', async () => {
  const { listener, request } = await open()
  const envelope = {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
    'io.modelcontextprotocol/clientCapabilities': ui,
  }
  listener({ id: 1, type: 'open' })
  const shown = await request(1, 'tools/call', {
    name: 'portfolio',
    arguments: {},
    _meta: envelope,
  })
  expect(shown.result).toMatchObject({
    content: [{ text: expect.stringContaining('Shown to the user as a card') }],
    _meta: { icons: {} },
  })
})

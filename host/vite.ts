import type { IncomingMessage, ServerResponse } from 'node:http'
import { json, text } from 'node:stream/consumers'
import {
  createMcpHandler,
  localhostAllowedOrigins,
  originValidationResponse,
} from '@modelcontextprotocol/server'
import type { Plugin } from 'vite'
import { server as mcp } from '../src/ai/server.ts'
import { createDb } from '../src/data/db.ts'
import { gate } from '../src/data/gate.ts'
import { icon } from './icons.ts'
import { links } from './mcp-connect.ts'
import { fetchProvider } from './providers.ts'
import { sqlite } from './sqlite.ts'

const toRequest = async (req: IncomingMessage, url: string) =>
  new Request(url, {
    method: req.method ?? 'GET',
    headers: Object.entries(req.headers).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as [string, string]] : [],
    ),
    ...(req.method === 'POST' && { body: await text(req) }),
  })

async function secret() {
  const file = Bun.file('data/mcp-token')
  if (await file.exists()) return file.text()
  const token = crypto.randomUUID()
  await Bun.write(file, token)
  return token
}

export function host(): Plugin {
  return {
    name: 'garner-host',
    async configureServer(server) {
      const sql = sqlite('data/garner.db')
      const db = createDb(sql)
      const token = await secret()
      const address = () => new URL(`host/mcp/${token}`, server.resolvedUrls?.local[0]).href
      const port = {
        ...sql,
        transport: fetchProvider,
        links: (connect: boolean) => links(address(), connect),
        address: async () => address(),
      }
      const listeners = new Set<ServerResponse>()
      const fetch = gate(fetchProvider)
      const sources = { card: (name: string) => Bun.file(`cards/${name}.html`).text(), icon }
      const handler = createMcpHandler(
        () =>
          mcp({ db, fetch }, sources, () => {
            for (const res of listeners) res.write('data: write\n\n')
          }),
        { responseMode: 'json' },
      )

      server.middlewares.use('/host', async (req, res) => {
        const path = req.url ?? ''
        const fail = (status: number) => {
          res.statusCode = status
          res.end()
        }
        if (path.startsWith('/mcp/')) {
          if (path.split('/')[2] !== token) return fail(401)
          const request = await toRequest(req, `http://${req.headers.host}${path}`)
          const response =
            originValidationResponse(request, localhostAllowedOrigins()) ??
            (await handler.fetch(request))
          res.writeHead(response.status, Object.fromEntries(response.headers))
          return res.end(await response.bytes())
        }
        if (req.headers['sec-fetch-site'] !== 'same-origin') return fail(403)
        if (path === '/events') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
          listeners.add(res)
          req.on('close', () => listeners.delete(res))
          return
        }
        try {
          if (path.startsWith('/icons/')) {
            const { pathname, searchParams } = new URL(path, 'http://host')
            const bytes = await icon(pathname.slice('/icons/'.length), searchParams.get('source'))
            if (!bytes) return fail(404)
            res.writeHead(200, { 'content-type': 'image/webp' })
            return res.end(bytes)
          }
          const name = path.slice(1)
          if (!Object.hasOwn(port, name)) throw new Error(`unknown method ${path}`)
          const call = port[name as keyof typeof port] as (...args: unknown[]) => Promise<unknown>
          const args = await json(req)
          if (!Array.isArray(args)) throw new TypeError('expected an argument list')
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify((await call(...args)) ?? null))
        } catch (error) {
          res.statusCode = 500
          res.end(error instanceof Error ? error.message : String(error))
        }
      })
    },
  }
}

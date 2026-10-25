import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Link } from '../src/data/host'

const name = 'garner-dev'

type Servers = Record<string, { url?: string }>

const read = <T>(path: string, parse: (text: string) => T): T | undefined => {
  try {
    return parse(readFileSync(join(homedir(), path), 'utf8'))
  } catch {
    return undefined
  }
}
const cli = async (...command: string[]) =>
  (await Bun.spawn(command, { stdout: 'ignore', stderr: 'ignore' }).exited) === 0

type App = {
  name: Link['app']
  tool: string
  url: () => string | undefined
  connect: (url: string) => Promise<boolean>
}

const apps: readonly App[] = [
  {
    name: 'Claude Code',
    tool: 'claude',
    url: () => read<{ mcpServers?: Servers }>('.claude.json', JSON.parse)?.mcpServers?.[name]?.url,
    connect: async (url) => {
      await cli('claude', 'mcp', 'remove', '--scope', 'user', name)
      return cli('claude', 'mcp', 'add', '--transport', 'http', '--scope', 'user', name, url)
    },
  },
  {
    name: 'Codex',
    tool: 'codex',
    url: () =>
      read('.codex/config.toml', (text) => Bun.TOML.parse(text) as { mcp_servers?: Servers })
        ?.mcp_servers?.[name]?.url,
    connect: (url) => cli('codex', 'mcp', 'add', name, '--url', url),
  },
]

const state = async (app: App, url: string, connect: boolean): Promise<Link['state']> => {
  if (app.url() === url) return 'connected'
  if (!connect) return 'missing'
  return (await app.connect(url)) && app.url() === url ? 'connected' : 'failed'
}

export const links = (url: string, connect: boolean): Promise<Link[]> =>
  Promise.all(
    apps
      .filter(({ tool }) => Bun.which(tool))
      .map(async (app) => ({ app: app.name, state: await state(app, url, connect) })),
  )

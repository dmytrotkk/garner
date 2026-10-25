export type Value = string | number | null
export type Statement = { sql: string; params: readonly Value[] }
export type Provider = 'coingecko' | 'frankfurter' | 'llama' | 'publicnode'

export type Sql = {
  query: <Row>(statement: Statement) => Promise<Row[]>
  batch: (statements: readonly Statement[]) => Promise<void>
  migrate: (statements: readonly Statement[]) => Promise<void>
  backup: (version: number) => Promise<void>
}

export type Reply =
  | { type: 'body'; body: unknown }
  | { type: 'status'; status: number; retryAfter: string | null }

export type Transport = (provider: Provider, path: `/${string}`, body?: unknown) => Promise<Reply>

export type Fetch = (provider: Provider, path: `/${string}`, body?: unknown) => Promise<unknown>

export type Icon = (coin: string, source: string | null) => Promise<Uint8Array<ArrayBuffer> | null>

export type Link = {
  app: 'Claude Code' | 'Claude Desktop' | 'Codex'
  state: 'connected' | 'missing' | 'confirm' | 'failed'
}

export type Host = Sql & {
  transport: Transport
  icon: Icon
  links: (connect: boolean) => Promise<Link[]>
  address: () => Promise<string>
}

export type Frame = { id: number } & (
  | { type: 'open' }
  | { type: 'line'; line: string }
  | { type: 'close' }
)

export type Relay = {
  clients: (listener: (frame: Frame) => void) => Promise<void>
  reply: (id: number, line: string) => Promise<void>
}

export const statement = (sql: string, ...params: Value[]): Statement => ({ sql, params })

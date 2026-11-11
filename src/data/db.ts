import {
  type Compilable,
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely'
import { type Sql, type Statement, statement, type Value } from './host.ts'

export type Migration = readonly string[]

export type Db = {
  read: <Row>(query: Compilable<Row>) => Promise<Row[]>
  write: (...queries: Compilable[]) => Promise<void>
  migrate: (migrations: readonly Migration[]) => Promise<void>
}

export const builder = <Schema>() =>
  new Kysely<Schema>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  })

const isValue = (value: unknown): value is Value =>
  value === null || typeof value === 'string' || typeof value === 'number'

function compile(query: Compilable): Statement {
  const { sql, parameters } = query.compile()
  if (!parameters.every(isValue)) throw new TypeError(`unsupported parameter in: ${sql}`)
  return { sql, params: parameters }
}

export const createDb = (host: Sql): Db => ({
  read: (query) => host.query(compile(query)),
  write: async (...queries) => host.batch(queries.map(compile)),
  migrate: async (migrations) => {
    await host.migrate([
      statement('create table if not exists migration (id integer primary key) strict'),
    ])
    const applied = await host.query(statement('select id from migration'))
    if (applied.length > migrations.length)
      throw new Error(
        'This database was written by a newer Garner. Install the latest Garner to open it.',
      )
    if (applied.length && applied.length < migrations.length) await host.backup(applied.length)
    for (const [id, statements] of migrations.entries().drop(applied.length))
      await host.migrate([
        statement('insert into migration values (?)', id),
        ...statements.map((sql) => statement(sql)),
      ])
  },
})

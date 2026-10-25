import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Sql, Statement, Value } from '../src/data/host'

export function sqlite(path: string): Sql {
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path, { strict: true })
  db.run('pragma journal_mode = wal')
  db.run('pragma foreign_keys = on')
  db.run('pragma optimize = 0x10002')
  const reader = new Database(path, { readonly: true, strict: true })

  const run = (statements: readonly Statement[]) => {
    for (const { sql, params } of statements) db.prepare(sql).run(...params)
  }
  const batch = db.transaction(run)
  const migrate = db.transaction((statements: readonly Statement[]) => {
    run(statements)
    if (db.prepare('pragma foreign_key_check').get()) throw new Error('foreign key check failed')
  })

  return {
    query: async <Row>({ sql, params }: Statement) =>
      reader.prepare<Row, Value[]>(sql).all(...params),
    batch: async (statements) => batch(statements),
    migrate: async (statements) => {
      db.run('pragma foreign_keys = off')
      try {
        migrate(statements)
      } finally {
        db.run('pragma foreign_keys = on')
      }
    },
    backup: async (version) => {
      const folder = join(dirname(path), 'backups')
      const file = join(folder, `${basename(path, '.db')}-before-m${version}.db`)
      if (existsSync(file)) return
      mkdirSync(folder, { recursive: true })
      db.prepare('vacuum into ?').run(file)
    },
  }
}

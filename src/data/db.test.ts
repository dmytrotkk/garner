import { expect, test } from 'bun:test'
import { fresh } from '../../host/fresh'
import { builder, createDb, type Migration } from './db'

type Schema = {
  institution: { id: string; name: string; note: string | null }
  flag: { on: boolean }
  migration: { id: number }
  sqlite_schema: { name: string }
}

const q = builder<Schema>()
const initial: Migration = [
  'create table institution (id text primary key, name text not null) strict',
]
const add = (id: string, name: string) => q.insertInto('institution').values({ id, name })

async function open() {
  const db = createDb(fresh())
  await db.migrate([initial])
  return db
}

test('migrate applies each migration once, in order', async () => {
  const db = await open()
  await db.migrate([initial])
  await db.migrate([initial, ['alter table institution add column note text']])
  await db.write(add('w1', 'ledger'))
  expect(await db.read(q.selectFrom('institution').select('note'))).toEqual([{ note: null }])
  expect(await db.read(q.selectFrom('migration').select('id'))).toEqual([{ id: 0 }, { id: 1 }])
})

test('pending migrations on a database with history back it up first, once', async () => {
  const host = fresh()
  const backups: number[] = []
  const db = createDb({
    ...host,
    backup: async (version) => {
      backups.push(version)
      await host.backup(version)
    },
  })
  const next = ['alter table institution add column note text']
  await db.migrate([initial])
  await db.migrate([initial])
  expect(backups).toEqual([])
  await db.migrate([initial, next])
  await db.migrate([initial, next])
  expect(backups).toEqual([1])
})

test('an older app refuses a database a newer one migrated, and changes nothing', async () => {
  const db = await open()
  await db.migrate([initial, ['alter table institution add column note text']])
  await expect(db.migrate([initial])).rejects.toThrow('written by a newer Garner')
  expect(await db.read(q.selectFrom('migration').select('id'))).toEqual([{ id: 0 }, { id: 1 }])
})

test('a failed migration leaves no trace', async () => {
  const db = await open()
  const broken = ['create table next (id text) strict', 'not sql']
  await expect(db.migrate([initial, broken])).rejects.toThrow()
  expect(await db.read(q.selectFrom('migration').select('id'))).toEqual([{ id: 0 }])
  expect(
    await db.read(q.selectFrom('sqlite_schema').select('name').where('name', '=', 'next')),
  ).toEqual([])
})

test('write is atomic and rejects unsupported parameters', async () => {
  const db = await open()
  await expect(db.write(q.insertInto('flag').values({ on: true }))).rejects.toThrow(TypeError)
  await db.write(add('w1', 'ledger'))
  await expect(db.write(add('w2', 'x'), add('w1', 'again'))).rejects.toThrow()
  expect(await db.read(q.selectFrom('institution').select('id'))).toEqual([{ id: 'w1' }])
})

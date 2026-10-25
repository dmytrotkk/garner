import { expect, test } from 'bun:test'
import { statement as s } from '../src/data/host'
import { fresh } from './fresh'

const count = s('select count(*) as n from holding')

async function open() {
  const host = fresh()
  await host.migrate([
    s('create table institution (id text primary key, name text not null) strict'),
    s(
      'create table holding (id text primary key, institutionId text not null references institution (id) on delete cascade) strict',
    ),
  ])
  await host.batch([
    s('insert into institution values (?, ?)', 'w1', 'ledger'),
    s('insert into holding values (?, ?)', 'h1', 'w1'),
  ])
  return host
}

test('query reads a database that was never written', async () => {
  expect(await fresh().query(s('select 1 as one'))).toEqual([{ one: 1 }])
})

test('batch is atomic', async () => {
  const host = await open()
  const batch = host.batch([
    s('insert into holding values (?, ?)', 'h2', 'w1'),
    s('insert into holding values (?, ?)', 'h1', 'w1'),
  ])
  await expect(batch).rejects.toThrow()
  expect(await host.query(count)).toEqual([{ n: 1 }])
})

test('query cannot write', async () => {
  const host = await open()
  await expect(host.query(s('delete from institution'))).rejects.toThrow()
})

test('migrate rejects foreign key violations', async () => {
  const host = await open()
  await expect(
    host.migrate([s('insert into holding values (?, ?)', 'h2', 'missing')]),
  ).rejects.toThrow()
  expect(await host.query(count)).toEqual([{ n: 1 }])
})

test('migrate rebuilds a parent without losing children, and select * sees its new columns', async () => {
  const host = await open()
  await host.query(s('select * from institution'))
  await host.migrate([
    s('create table next (id text primary key, owner text, name text not null) strict'),
    s("insert into next select id, 'me', name from institution"),
    s('drop table institution'),
    s('alter table next rename to institution'),
  ])
  expect(await host.query(s('select * from institution'))).toEqual([
    { id: 'w1', owner: 'me', name: 'ledger' },
  ])
  expect(await host.query(count)).toEqual([{ n: 1 }])
})

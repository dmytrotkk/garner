import { expect, test } from 'bun:test'
import { coin, migrated } from '../../host/fresh.ts'
import { icon } from './icons.ts'
import { q } from './schema.ts'

test('a held coin takes its logo from a deployment, never from its canonical row', async () => {
  const db = await migrated()
  const eth = coin('coingecko:ethereum', 'ETH')
  await db.write(q.insertInto('asset').values([eth, { ...eth, id: 'eip155:8453/native' }]))
  const asked: [string, string | null][] = []
  const load = async (id: string, source: string | null) => {
    asked.push([id, source])
    return null
  }
  await icon(db, load, eth.id)
  await icon(db, load, 'coingecko:bitcoin')
  await icon(db, load, 'fiat:EUR')
  expect(asked).toEqual([
    ['ethereum', '8453/0x0000000000000000000000000000000000000000'],
    ['bitcoin', null],
  ])
})

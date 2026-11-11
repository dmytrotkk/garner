import { expect, test } from 'bun:test'
import { migrated } from '../../host/fresh.ts'
import { q } from '../data/schema.ts'
import { mask, unmask } from './mask.ts'

const vitalik = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const other = '0x71c7656ec7ab88b098defb751b7401b5f6d8976f'

test('addresses become stable placeholders in strings, arrays and objects, in any case', async () => {
  const db = await migrated()
  const first = await mask(db, {
    name: `Main ${vitalik}`,
    list: [other, { deep: vitalik.toUpperCase() }],
  })
  expect(first).toEqual({ name: 'Main addr_1', list: ['addr_2', { deep: 'addr_1' }] })
  expect(await mask(db, `again ${other}`)).toBe('again addr_2')
  expect(await db.read(q.selectFrom('alias').select('placeholder').orderBy('placeholder'))).toEqual(
    [{ placeholder: 'addr_1' }, { placeholder: 'addr_2' }],
  )
})

test('a truncated address maps to its placeholder when one address matches, else to a bare mark', async () => {
  const db = await migrated()
  await mask(db, vitalik)
  expect(await mask(db, 'account 0xd8da…6045 and 0x71c7…976f')).toBe('account addr_1 and 0x…')
})

test('a transaction hash is redacted whole and never becomes a placeholder', async () => {
  const db = await migrated()
  const hash = `0x${'ab'.repeat(32)}`
  expect(await mask(db, `tx ${hash} from ${vitalik}`)).toBe('tx 0x… from addr_1')
  expect(await db.read(q.selectFrom('alias').select('placeholder'))).toEqual([
    { placeholder: 'addr_1' },
  ])
})

test('unmask restores addresses and rejects unknown placeholders', async () => {
  const db = await migrated()
  await mask(db, [vitalik, other])
  expect(await unmask(db, { address: 'addr_2', note: 'send to addr_1' })).toEqual({
    address: other,
    note: `send to ${vitalik}`,
  })
  await expect(unmask(db, 'addr_9')).rejects.toThrow('Unknown address placeholder addr_9.')
})

test('placeholders are numbered by the write, so two masks at once never collide', async () => {
  const db = await migrated()
  await mask(db, vitalik)
  const third = '0x0000000000000000000000000000000000000001'
  const [a, b] = await Promise.all([mask(db, other), mask(db, third)])
  expect(new Set([a, b])).toEqual(new Set(['addr_2', 'addr_3']))
  expect(await db.read(q.selectFrom('alias').select('placeholder').orderBy('placeholder'))).toEqual(
    [{ placeholder: 'addr_1' }, { placeholder: 'addr_2' }, { placeholder: 'addr_3' }],
  )
  expect(await mask(db, other)).toBe(a)
})

test('numbers and non-address text pass through', async () => {
  const db = await migrated()
  const value = { total: 12.5, text: '0x12 is not an address', flag: null }
  expect(await mask(db, value)).toEqual(value)
})

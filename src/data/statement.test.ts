import { expect, test } from 'bun:test'
import { cells, chain, heading, instant, keyed, open } from './statement.ts'

test('cells reads quoted commas, doubled quotes, both line ends and a byte order mark', () => {
  expect(cells('\uFEFFa,b\r\n"1,5","say ""hi"""\n\n"two\nlines",\n', ',')).toEqual([
    ['a', 'b'],
    ['1,5', 'say "hi"'],
    ['two\nlines', ''],
  ])
  expect(cells('a;b', ';')).toEqual([['a', 'b']])
  expect(cells('', ',')).toEqual([])
})

test('a heading is the first line, trimmed and lower case', () => {
  expect(heading(' Type ,Started Date\nrow,1\n', ',')).toBe('type,started date')
  expect(heading('no line end', ',')).toBe('')
})

const link = (series: string, delta: bigint, balance: bigint) => ({ series, delta, balance })

test('a chain is oriented oldest first per series, whatever the file order', () => {
  const newestFirst = [
    link('a', -3n, 12n),
    link('a', 5n, 15n),
    link('b', 1n, 1n),
    link('a', 0n, 10n),
  ]
  const ordered = chain(newestFirst, (item) => item)
  expect(ordered.map(({ series, balance }) => `${series}${balance}`)).toEqual([
    'a10',
    'a15',
    'a12',
    'b1',
  ])
  const oldestFirst = [link('a', 0n, 10n), link('a', 5n, 15n), link('a', -3n, 12n)]
  expect(chain(oldestFirst, (item) => item)).toEqual(oldestFirst)
})

test('a chain with holes keeps its order, a balance that follows nothing is refused', () => {
  const hole = [1n, 2n, 9n, 10n, 20n, 21n].map((balance) => link('a', 1n, balance))
  expect(chain(hole, (item) => item)).toEqual(hole)
  const noise = [link('a', 1n, 5n), link('a', 1n, 50n), link('a', 1n, 7n)]
  expect(() => chain(noise, (item) => item)).toThrow('The balance of a does not follow its rows.')
})

test('an instant pads its stamp and never moves through a time zone', () => {
  process.env.TZ = 'America/New_York'
  const [second, day] = [instant([2026, 1, 6, 6, 11, 59]), instant([2026, 3, 30])]
  process.env.TZ = 'UTC'
  expect(second).toEqual({
    stamp: '20260106061159',
    time: Date.UTC(2026, 0, 6, 6, 11, 59),
  })
  expect(day).toEqual({ stamp: '20260330', time: Date.UTC(2026, 2, 30) })
})

test('a key holds only what the row says, and twins are counted per label', () => {
  const key = keyed()
  const coffee = {
    label: 'Current',
    stamp: '20260107080001',
    unit: 'EUR',
    amount: -1650n * 10n ** 15n,
  }
  expect(key(coffee)).toBe('row:20260107080001:EUR:-1.65:0')
  expect(key(coffee)).toBe('row:20260107080001:EUR:-1.65:1')
  expect(key({ ...coffee, label: 'Savings' })).toBe('row:20260107080001:EUR:-1.65:0')
  expect(key({ ...coffee, amount: 0n })).toBe('row:20260107080001:EUR:0:0')
  expect(keyed()(coffee)).toBe('row:20260107080001:EUR:-1.65:0')
})

test('a file is read as UTF-8, else as Windows-1252', () => {
  expect(open('a.csv', new TextEncoder().encode('Café')).text).toBe('Café')
  expect(open('a.csv', Uint8Array.of(0x43, 0x61, 0x66, 0xe9)).text).toBe('Café')
})

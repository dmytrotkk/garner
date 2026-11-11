import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDb } from '../src/data/db.ts'
import { type Address, type AssetId, type Day, migrations } from '../src/data/schema.ts'
import { sqlite } from './sqlite.ts'

const dir = mkdtempSync(join(tmpdir(), 'garner-'))
process.on('exit', () => rmSync(dir, { recursive: true }))

export const fresh = () => sqlite(join(dir, `${crypto.randomUUID()}.db`))

export async function migrated() {
  const db = createDb(fresh())
  await db.migrate(migrations)
  return db
}

export { coin } from '../src/data/schema.ts'

export const institution = (id: string, name = id) => ({ id, name, updatedAt: 1 })

export const account = (id: string, institutionId: string, address: Address | null = null) => ({
  id,
  institutionId,
  name: id,
  kind: address ? ('evm' as const) : ('manual' as const),
  address,
  updatedAt: 1,
})

export const held = (accountId: string, assetId: AssetId, day: Day, quantity: string) => ({
  accountId,
  assetId,
  day,
  time: Date.parse(day),
  quantity,
})

export const moved = (
  accountId: string,
  assetId: AssetId,
  day: Day,
  quantity: string,
  memo: string | null = null,
) => ({
  accountId,
  ref: `${assetId} ${day} ${quantity}`,
  leg: 'amount',
  time: Date.parse(day),
  kind: 'transfer' as const,
  assetId,
  quantity,
  memo,
})

const concat = (...parts: readonly Uint8Array[]) =>
  Uint8Array.from(parts.flatMap((part) => [...part]))
const bytes = (size: number, fill: (view: DataView) => void) => {
  const out = new Uint8Array(size)
  fill(new DataView(out.buffer))
  return out
}
const record = (type: number, body: Uint8Array) =>
  concat(
    bytes(4, (view) => {
      view.setUint16(0, type, true)
      view.setUint16(2, body.length, true)
    }),
    body,
  )
const latin = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))
const wide = (text: string) =>
  new Uint8Array(Uint16Array.from(text, (char) => char.charCodeAt(0)).buffer)
const head = (length: number) =>
  bytes(3, (view) => {
    view.setUint16(0, length, true)
  })
const bof = (kind: number) =>
  record(
    0x809,
    bytes(16, (view) => {
      view.setUint16(0, 0x600, true)
      view.setUint16(2, kind, true)
    }),
  )
const cell = (
  type: number,
  row: number,
  col: number,
  size: number,
  value: (view: DataView) => void,
) =>
  record(
    type,
    bytes(size, (view) => {
      view.setUint16(0, row, true)
      view.setUint16(2, col, true)
      value(view)
    }),
  )

export function book() {
  const counts = bytes(8, (view) => {
    view.setUint32(0, 3, true)
    view.setUint32(4, 3, true)
  })
  const stream = concat(
    bof(5),
    record(
      0xfc,
      concat(counts, head(5), latin('Title'), head(4), latin('Ca\tf'), head(7), latin('Caf')),
    ),
    record(0x3c, concat(Uint8Array.of(1), wide('é ok'))),
    record(0x0a, new Uint8Array()),
    bof(0x10),
    cell(0xfd, 0, 0, 10, (view) => view.setUint32(6, 0, true)),
    cell(0xfd, 2, 0, 10, (view) => view.setUint32(6, 2, true)),
    cell(0x203, 2, 2, 14, (view) => view.setFloat64(6, -1234.56, true)),
    cell(0xfd, 3, 1, 10, (view) => view.setUint32(6, 1, true)),
    record(0x0a, new Uint8Array()),
  )
  const sectors = Math.ceil(Math.max(stream.length, 4096) / 512)
  const header = bytes(512, (view) => {
    Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1).forEach((byte, at) => {
      view.setUint8(at, byte)
    })
    view.setUint16(30, 9, true)
    view.setUint32(44, 1, true)
    view.setUint32(48, 1, true)
    view.setUint32(56, 4096, true)
    view.setUint32(76, 0, true)
  })
  const fat = bytes(512, (view) => {
    for (let id = 0; id < 128; id++) view.setUint32(id * 4, 0xffffffff, true)
    view.setUint32(0, 0xfffffffd, true)
    view.setUint32(4, 0xfffffffe, true)
    for (let id = 2; id < sectors + 2; id++)
      view.setUint32(id * 4, id === sectors + 1 ? 0xfffffffe : id + 1, true)
  })
  const directory = bytes(512, (view) => {
    Array.from('Workbook').forEach((char, at) => {
      view.setUint16(128 + at * 2, char.charCodeAt(0), true)
    })
    view.setUint16(128 + 64, 18, true)
    view.setUint8(128 + 66, 2)
    view.setUint32(128 + 116, 2, true)
    view.setUint32(128 + 120, Math.max(stream.length, 4096), true)
  })
  return concat(header, fat, directory, stream, new Uint8Array(sectors * 512 - stream.length))
}

import { sql } from 'kysely'
import type { Db } from '../data/db.ts'
import { type Address, q } from '../data/schema.ts'

const hash = /0x[0-9a-f]{64}/gi
const full = /0x[0-9a-f]{40}/gi
const partial = /0x[0-9a-f]{4}…[0-9a-f]{4}/gi
const placeholder = /addr_\d+/g
const next = sql<string>`'addr_' || ((select count(*) from alias) + 1)`

const aliases = (db: Db) => db.read(q.selectFrom('alias').selectAll().orderBy('createdAt'))

export async function mask<T>(db: Db, value: T, now = Date.now()): Promise<T> {
  const json = JSON.stringify(value).replace(hash, '0x…')
  const found = [...new Set(json.toLowerCase().match(full) as Address[] | null)]
  if (found.length)
    await db.write(
      ...found.map((address) =>
        q
          .insertInto('alias')
          .values({ placeholder: next, address, createdAt: now })
          .onConflict((oc) => oc.column('address').doNothing()),
      ),
    )
  const known = new Map(
    (await aliases(db)).map(({ address, placeholder }) => [address, placeholder]),
  )
  const ofPartial = (match: string) => {
    const [head, tail] = [match.slice(0, 6).toLowerCase(), match.slice(-4).toLowerCase()]
    const [hit, ...rest] = [...known].filter(
      ([address]) => address.startsWith(head) && address.endsWith(tail),
    )
    return hit && !rest.length ? hit[1] : '0x…'
  }
  return JSON.parse(
    json
      .replace(full, (match) => known.get(match.toLowerCase() as Address) ?? match)
      .replace(partial, ofPartial),
  )
}

export async function unmask<T>(db: Db, value: T): Promise<T> {
  const known = new Map(
    (await aliases(db)).map(({ placeholder, address }) => [placeholder, address]),
  )
  return JSON.parse(
    JSON.stringify(value).replace(placeholder, (match) => {
      const address = known.get(match)
      if (!address) throw new Error(`Unknown address placeholder ${match}.`)
      return address
    }),
  )
}

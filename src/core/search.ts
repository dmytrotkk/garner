export type Searchable = {
  group: string
  label: string
  note?: string
  keywords?: readonly string[]
}

export type Group<Item> = { label: string; items: Item[] }

export type Ranked<Item> = Group<Item> & { tier: number }

export type Index = { vocab: readonly string[]; docs: readonly (readonly Uint32Array[])[] }

export type Hits = { tokens: Uint8Array; typo: boolean }

export const plain = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

export const words = (text: string) => text.match(/[\p{L}\p{N}]+(?:[.,]\p{N}+)*/gu) ?? []

export const tokens = (text: string) => words(plain(text))

const budget = (length: number) => (length < 4 ? 0 : length < 8 ? 1 : 2)

const rows = [new Uint8Array(64), new Uint8Array(64), new Uint8Array(64)]

function near(term: string, token: string, max: number) {
  const width = Math.min(token.length, term.length + max)
  if (term.length > 60 || width < term.length - max) return false
  let [before, above, row] = rows as [Uint8Array, Uint8Array, Uint8Array]
  for (let j = 0; j <= width; j++) above[j] = j
  for (let i = 1; i <= term.length; i++) {
    row[0] = i
    let least = i
    for (let j = 1; j <= width; j++) {
      const swapped = i > 1 && j > 1 && term[i - 1] === token[j - 2] && term[i - 2] === token[j - 1]
      const cell = Math.min(
        (above[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (above[j - 1] ?? 0) + (term[i - 1] === token[j - 1] ? 0 : 1),
        swapped ? (before[j - 2] ?? 0) + 1 : max + 1,
      )
      row[j] = cell
      least = Math.min(least, cell)
    }
    if (least > max) return false
    ;[before, above, row] = [above, row, before]
  }
  return true
}

export function index(docs: readonly (readonly string[])[]): Index {
  const ids = new Map<string, number>()
  const field = (text: string) =>
    Uint32Array.from(tokens(text), (token) => ids.get(token) ?? ids.set(token, ids.size).size - 1)
  const fields = docs.map((texts) => texts.map(field))
  return { vocab: [...ids.keys()], docs: fields }
}

export const searchable = (items: readonly Searchable[]) =>
  index(items.map(({ label, note = '', keywords = [] }) => [label, [note, ...keywords].join(' ')]))

export const starts = ({ vocab }: Index, term: string) =>
  vocab.some((token) => token.startsWith(term))

export function hits({ vocab }: Index, term: string, typos: boolean): Hits {
  const prefixed = Uint8Array.from(vocab, (token) => Number(token.startsWith(term)))
  if (!typos || prefixed.includes(1)) return { tokens: prefixed, typo: false }
  const max = /^\p{L}+$/u.test(term) ? budget(term.length) : 0
  const close = (token: string) => max > 0 && token[0] === term[0] && near(term, token, max)
  return { tokens: Uint8Array.from(vocab, (token) => Number(close(token))), typo: true }
}

export function hit(field: Uint32Array, { tokens }: Hits) {
  let at = 0
  for (const token of field) {
    if (tokens[token] === 1) return at
    at++
  }
  return -1
}

const none = new Uint32Array()

export function search<Item extends Searchable>(
  items: readonly Item[],
  query: string,
  limit = Number.POSITIVE_INFINITY,
  known: (term: string) => boolean = () => false,
): Ranked<Item>[] {
  const terms = [...new Set(tokens(query))]
  if (query.trim() && !terms.length) return []
  const own = searchable(items)
  const found = terms.map((term) => hits(own, term, !known(term)))
  const tierOf = ([label = none, rest = none]: readonly Uint32Array[]) => {
    let tier = 0
    for (const each of found) {
      const at = hit(label, each)
      const place = at === 0 ? 0 : at > 0 ? 1 : hit(rest, each) >= 0 ? 2 : -1
      if (place < 0) return place
      tier = Math.max(tier, place + (each.typo ? 3 : 0))
    }
    return tier
  }
  const ranked = items.flatMap((item, at) => {
    const tier = tierOf(own.docs[at] ?? [])
    return tier < 0 ? [] : [{ item, tier }]
  })
  return [...Map.groupBy(ranked, ({ item }) => item.group)]
    .map(([label, members]) => {
      const sorted = members.toSorted((a, b) => a.tier - b.tier)
      return {
        label,
        tier: sorted[0]?.tier ?? 0,
        items: sorted.slice(0, limit).map(({ item }) => item),
      }
    })
    .toSorted((a, b) => a.tier - b.tier)
}

# garner search

One search for the whole app, in the one palette: institutions, accounts, assets, merchants, categories, pages and actions by name, every movement by its words, narrowed by a period, an amount and three flags, with one results page behind it. Proposed on 2026-10-21 and agreed the same day, every decision below as recommended; built the same day in step 28 of `foundation.md`. No table, no migration, no dependency, nothing derived stored.

## Why

- The palette finds institutions, accounts, held assets, pages and actions by label (`search` in `src/core/search.ts`): lower case only, no accent folding, no typos, groups in input order.
- Movements, merchants, categories, people and periods have no way in; step 23 left "a month opened in detail" open.
- The keys 1 to 5 run the first five rows (`quick` in `palette.tsx`), so no amount or year can be typed.
- The root loader already reads every movement on each invalidate and keeps only counts; Home reads them all again. An index over that array costs no read.
- Finance search is a filtered list with its total (Copilot, Monzo, YNAB, Apple Card); none mixes entities, periods and actions in one field. garner can, since everything sits in the page.

## Requirements

From Cmd+K or the window bar field, Enter opens the thing named, or the list of the matching movements with their total.

1. Jump to a place by name, forgiving accents and typos: `revolut` lists the institution first, then its accounts, movements and actions, and Enter opens it; `santnder` finds Santander, `cafe` Café, `0xd8da` the account holding that address.
2. Open a merchant or a category: `continente`, `contnente`, `eating` (Eating out), `groceris` (Groceries).
3. Find movements by any word they carry.
   - `netflix`, before Netflix is a merchant: the Movements group, its reading row `Movements matching "netflix"` with their count and Net, then the three newest. Enter opens `/movements?q=netflix`.
   - `dinner` finds the note; `savings` the transfers into Savings and its rows; `transfers` every internal movement; `income` every movement under an income category.
4. A person: `simao` both directions with the Net; `received simao` the money in, as the month headers count In, so repayments under Loans stay out; `simao 2025` that year.
5. A period: `march` reads `Movements in March 2026`, the latest March that has started; also `last month`, `q3 2025`, `aug to oct`, `between march and may`, `last 30 days`, `since june`.
6. What something cost: `spent groceries last month` reads `Spent matching "groceries" in September 2026` with its Spent; `how much did i spend on eating out this year`.
7. An amount: `12.99` exactly, `82` from 82.00 to 82.99, `over 500`, `more than 500`, `under 5 coffee`, `over 100 under 200`, `50 to 100`, `between 50 and 100`, `50-100`, `2,000` for the amount 2000.
8. What waits: `uncategorized`, `uncategorized over 100`, `uncategorised last month`.
9. An action: `import`, `hide balances`, `rename revolut`, `sync`, `show values in eur`.
10. See all, refine, go back: Enter on a Movements row pushes `/movements?q=...`, Edit search reopens the palette with the text selected, Back returns.
11. See the reading and override it: `march` reads March 2026 and `"march"` the word; `2025` is a year and `2045` an amount; `4821` is an amount, with a words row offering `"4821"` when a memo carries it.

Not goals: a model or the network in matching or reading (Ask Garner waits on chat); a second search field (23p); stored state (tables, FTS, recents, pins); person, period or movement pages; operators, logic, negation, sort words; Portuguese query words, since bank text matches through folding; an MCP tool.

## Results

Every row is a `Command`: one anatomy, one list primitive, one Enter. Tiles follow decision 10.

| Row | Group | Icon | Label | Note | Right end | Enter opens |
|---|---|---|---|---|---|---|
| Reading | Movements | `Search01Icon` | the reading | - | the count, then the total | `/movements?q=<input>` |
| Words, when it matches | Movements | `Search01Icon` | the words reading | - | its count and total | `/movements?q=<literal>` |
| Movement, the 3 newest | Movements | its `sm` `Tile`, as in the table | merchant name, else bank text, else kind label | `Oct 3 · Current` | `sum(assetId, quantity)` | `/movements?q=<input>` |
| Institution | Institutions | `glyphOf` | name | - | `Money` compact | `/institutions/$institutionId` |
| Account | Accounts | `Wallet03Icon` | name | institution | `Money` compact | `/accounts/$accountId` |
| Asset, held | Assets | `TokenIcon` | symbol | name | `Money` compact | `/assets/$assetId` |
| Merchant, new | Merchants | `kindIcons[kind]` | name | `kindLabel(kind)` | - | `/merchants/$merchantId` |
| Category, new | Categories | its `sm` `Tile` | name | hint | - | `/categories/$categoryId` |
| Page | Go to | its icon | label | - | - | its path |
| Action | Actions, or the current object's name | its SF Symbol's Hugeicon | label | object name | - | `run()` |

Destinations:
- **Results page**: `/movements?q=`, the one new route, named for what it lists, not `/search`, since it has no field of its own. Without `q` it is every movement, Go to's Movements (decision 2).
- **A person**: no page; `/movements?q=simao` is the person, both directions, with the Net.
- **A period**: no page. `/movements?q=march` is the period with its totals, which answers step 23's "a month opened in detail".
- **A single movement**: no page. Its preview row opens the results page of the query, where it stands among the first rows with its menu.

Step 23p's rule holds: the results page has no input, Edit search reopens the palette with the same text, the window bar field stays a button, and the app has no scopes.

## Data structures

`src/core/search.ts`, replacing today's file:

```ts
export type Searchable = { group: string; label: string; note?: string; keywords?: readonly string[] }
export type Group<Item> = { label: string; items: Item[] }
export type Ranked<Item> = Group<Item> & { tier: number }
export type Index = { vocab: readonly string[]; docs: readonly (readonly Uint32Array[])[] }
export type Hits = { tokens: Uint8Array; typo: boolean }

export const plain: (text: string) => string
export const words: (text: string) => string[]
export const tokens: (text: string) => string[]
export function index(docs: readonly (readonly string[])[]): Index
export const searchable: (items: readonly Searchable[]) => Index
export const starts: (index: Index, term: string) => boolean
export function hits(index: Index, term: string, typos: boolean): Hits
export function hit(field: Uint32Array, hits: Hits): number
export function search<Item extends Searchable>(
  items: readonly Item[],
  query: string,
  limit?: number,
  known?: (word: string) => boolean,
): Ranked<Item>[]
```

A doc is a list of fields, a field its token ids in text order. `words` splits text as typed, `tokens` splits its `plain` form, and `searchable` indexes commands as two fields, the label, then the note and keywords. `Hits.tokens` holds a byte per vocabulary token; `hit` gives the position of the first one marked, or -1. `limit` defaults to every match; `known` marks a word that starts a token elsewhere, so it takes no typo. The typo distance, `near`, stays inside the module.

`src/data/query.ts`, new and pure:

```ts
export type Flag = 'spent' | 'received' | 'uncategorized'
export type Figure = { value: bigint; places: number }
export type Facet =
  | { kind: 'period'; from: Day; to: Day }
  | { kind: 'amount'; value: Figure }
  | { kind: 'range'; from: Figure; to: Figure }
  | { kind: 'over' | 'under'; value: Figure }
  | { kind: 'flag'; flag: Flag }
export type Query = { words: readonly string[]; facets: readonly Facet[] }

export function parse(input: string, today: Day): Query
export function reading(query: Query): string
export function named(period: { from: Day; to: Day }): string
export function literal(input: string, today: Day): string | undefined
export function holds(
  facets: readonly Facet[],
  typeOf: (row: Movement) => CategoryType | undefined,
): (row: Movement) => boolean
```

- `Figure.value` is a quantity at `scale` 18 from viem's `parseUnits`, already a dependency. `places` is the decimals typed, so an `amount` covers `[value, value + 10^-places)`: `82` covers 82.00 to 82.99, `82.50` only 82.50.
- A `range` runs from `from` to `to` itself, both inclusive (decision 5). `over` and `under` are strict on `value`.
- Words and facets all AND. The query string is the only state: facets, reading and title derive from it. Words keep their typed spelling; matching folds them.

`src/routes/-search.tsx`, new:

```ts
type Data = Pick<
  (typeof Route)['types']['loaderData'],
  'rows' | 'context' | 'institutions' | 'holdings' | 'merchants' | 'byCategory'
>
type Built = { index: Index; worth: Float64Array }
export type Total = { label: 'Spent' | 'Received' | 'Net'; amount: number }
export type Found = { rows: Movement[]; typo: boolean; total: Total }

export function matching(data: Data, query: Query, known?: (word: string) => boolean): Found
export function useFind(commands: readonly Command[]): (input: string) => readonly Ranked<Command>[]
```

`Route` is a type import from `./__root`: `ReturnType<typeof root.useLoaderData>` is `any`, the hook being generic over its router. `Built` is cached in a `WeakMap<readonly Movement[], Built>` keyed by the root loader's `rows`, shared by the palette and the results loader. `worth[i]` is movement `i`'s signed value in the display currency at its day's rate. `Found.rows` keep the loader's order, newest first; `typo` says a word reached movements only through a typo.

`src/routes/-layer.ts`: the palette arm gains its seed and one event.

```ts
export type Layer = { kind: 'none' } | { kind: 'palette'; query: string } | { kind: 'prompt'; prompt: Prompt }

type Event =
  | { type: 'ask'; prompt: Prompt }
  | { type: 'search' }
  | { type: 'refine'; query: string }
  | { type: 'close'; of: 'palette' | 'prompt' }

case 'search':
  if (layer.kind === 'prompt') return layer
  return layer.kind === 'palette' ? none : { kind: 'palette', query: '' }
case 'refine':
  return layer.kind === 'none' ? { kind: 'palette', query: event.query } : layer

export const search = () => send({ type: 'search' })
export const refine = (query: string) => send({ type: 'refine', query })
```

`search` keeps no arguments, since `GlassSearch` takes it as `onClick` and the menu bar calls `shown(search)`. The typed text stays the mounted list's `useState(initial)` and the highlight Base UI's: nothing else needs a state.

`src/ui/palette.tsx`:

```ts
type Props = {
  open: boolean
  onClose: () => void
  initial: string
  placeholder: string
  find: (query: string) => readonly Group<Command>[]
}
```

`src/routes/movements.tsx`:

```ts
type Search = { q: string }

validateSearch: ({ q }: Record<string, unknown>): Search => ({
  q: typeof q === 'string' || typeof q === 'number' ? String(q) : '',
}),
loaderDeps: ({ search: { q } }) => ({ q }),
```

TanStack's default `parseSearch` JSON-parses values: the app's own links quote `q`, a hand-typed `?q=2025` arrives as a number the coercion keeps, and a hand-typed boolean reads blank and `?q=82.50` reads 82.5, both accepted. The root loader also returns `rows` and `context`, its `valuation(db, rows)` run beside `display`.

## Algorithms

### Plain text and tokens

- `plain`: NFKD, marks (`\p{M}`) stripped, lower case. It is `partyOf`'s normalization moved to core and `partyOf` calls it, so no party key changes.
- `tokens`: `/[\p{L}\p{N}]+(?:[.,]\p{N}+)*/gu`: `12,50` and `1.234,56` stay one token, `Pão-de-Ló` gives `Pão`, `de` and `Ló`, indexed through `plain`.
- No map for ł, ß or æ: it would change `partyOf`, and the bank text has none.

### Movement text

One field per movement, joining:
- the bank text and the note;
- the merchant's and the category's names;
- the category type as Categorize groups it, Expenses, Income or Transfers, an internal movement taking Transfers;
- the account's and its institution's names, and a paired or proposed transfer's peer account;
- the kind label for a fee, income or trade (`kinds` in `-movements.tsx`), never for a plain transfer;
- the fiat code, or a held coin's symbol.

So `revolut coffee`, `income` and `simao` are plain words, and nothing decides which kind of thing a word names: `bolt` counts Bolt Food too, and the merchant page is the exact view. The amount and the date are never text.

### Index

- `index(docs)` is one pass: a `Map<string, number>` of token ids, then one `Uint32Array` per field. A movement has one field; a command two, its label, then its note and keywords.
- `Built` adds `worth`, from `valuer(context)`, an unpriced day counting 0 as in `months`.
- Built when the palette opens or the results page loads after a data change, never per keystroke. Commands, about 150, are indexed on each `search` call, so nothing caches them.

### Matching

- Per word, over the vocabulary: every token that starts with it. When none does, every token within its typo budget, by `near`: bounded optimal string alignment, a transposition one edit, read against the token as a prefix, so `contni` reaches `continente`.
- Budget: letters only, the first letter fixed; 0 edits under 4 letters, 1 from 4 to 7, 2 from 8. Digits never take a typo. `bolr` reaches `bolt`, `volt` does not.
- Typos are a fallback, never a widening: a word that starts any token, of the movements or the commands, takes no typo in either (`useFind` passes both one `known`), so `uber` never reaches `user` while Uber exists, nor `maria` `marta`, nor `import` the bank word `imposto`.
- A movement matches when every word hits its field and every facet holds.
- A command's tier for a word: 0 on the first token of its label, 1 another label token, 2 its note or a keyword, plus 3 after a typo. Its tier is its worst word's. The substring tier goes (decision 12).

### Ranking and groups

- Commands sort by tier, then input order. Movements stay newest first, the loader's order, everywhere; extending a query never reorders the survivors.
- The Movements group ranks as a note match, tier 2 or 5 after a typo, and first whenever the query holds a facet. It enters before the command groups, so it leads a tie: `revolut` gives Institutions and the accounts named Revolut, then Movements, then the actions noted Revolut.
- Groups keep input order while idle and sort stably by best tier while typing.
- Commands match the query's words; a query without words (`march`, `last month`, stop words alone) matches them by its raw tokens, so the merchant March shows beside the month and `a` finds ActivoBank.

### Caps and counts

- `limit` caps every group: the palette passes 5, the Combobox 50, Categorize none.
- Idle is the blank query only: today's groups in today's order. Movements, Merchants and Categories show only while typing.
- Typing: the Movements group is the reading row, the words row when it matches, and the 3 newest matches. It shows when a movement matches, the query holds a facet, or nothing else matches a query with a word, so a reading shows even at `0 movements` and a misspelled flag shows quoted. Stop words alone show no Movements group, and Nothing found if no command matches.
- The count is exact: the scan visits every movement.

### The query

`parse` normalizes first: curly and angle double quotes become `"`, and outside quotes a dash between two digits, spaces around it allowed (the hyphen, U+2010 to U+2015, U+2212), becomes ` to `. It splits on `"`: odd segments are quoted words, never read. Each other segment is tokenized and walked left to right, the longest reading first.

| Words | Read as |
|---|---|
| `today`, `yesterday` | that day |
| `this` or `last` with `week`, `month`, `quarter`, `year` | that calendar unit; weeks start on Monday |
| `last` N `days`, `weeks` | rolling, ending today |
| `last` N `months`, `years` | whole units including the current one, as `trailing` |
| `past` N, a singular unit after N | as `last` N: `past 30 days`, `last 1 month` |
| `q1` to `q4`, a year optional | that quarter |
| a month name, a day and a year optional | that month or day: `march`, `may 12`, `mar 25`, `Oct 20, 2026` |
| `jan` to `dec`, `sept` | months only beside a number or `to`, after `since` or inside `between` ... `and`, so a bare `mar` stays a word |
| a 4-digit number from 2000 to this year | that year |
| A `to` B, `between` A `and` B | from A's start to B's end for two periods, a `range` for two amounts |
| `since` A | from A's start to today |
| a number | an `amount` at the precision typed |
| `over`, `above`, `more than` N | a magnitude above N |
| `under`, `below`, `less than` N | a magnitude below N |
| `spent`, `spend`, `spending` | the Spent flag |
| `received` | the Received flag |
| `uncategorized`, `uncategorised` | the Uncategorized flag |
| `a all an and at by did do for from how i in is matching me movements much my of on show the to was what were with` | dropped |
| `"..."` | words, never read |

Rules:
- A month or day without a year is the latest that has started: in October, `november` is November 2025. The year after a month, day or quarter is a 4-digit number from 2000 to this year, any other number an amount: `march 1500`.
- In A to B, a side without a year takes the other side's. When neither has one, A is the latest that has started and B steps forward a year if it would end before A starts: `nov to jan` is Nov 2025 to Jan 2026, `oct to dec` Q4 2026, `march 2025 to may` Mar to May 2025.
- A number after a month is its day when that day exists, else an amount: `feb 30` reads February 2026 of 30. `feb 29` without a year is the latest Feb 29.
- Today is the local day, `local(Date.now()) as Day` as in `dayOf`, compared with the row's UTC day, the printed day (`ledger.md`, Time).
- Periods read before amounts: `2024 to 2025` is two years, `50 to 100` one range.
- Numbers: the last separator is the decimal point, unless the number is 1 to 3 digits not starting with 0, one separator and exactly 3 digits (`1,200` and `1.200` are 1200, `0.005` stays 0.005), or repeats one separator (`1.234.567`); `1.234,56` is 1234.56. An amount from 2000 to this year is typed `2,000`, since `2000` is the year. A zero before another digit (`0042`) makes a word. Quantities come from `parseUnits(text, 18)`, never `Number`.
- A bare number is an amount only. Digits in bank text are reached by quotes (`"4821"`), which the words row offers.
- A name that collides with the vocabulary reads as the vocabulary; quotes reach the name (`"march"`). No typo correction toward the vocabulary: `marco`, a common name, is one edit from `march`, and a misspelled flag shows quoted, not understood.
- The reading never depends on data; only the words row looks at it.

### The reading

`reading(query)` prints one sentence, in a fixed order whatever the typing:
- the subject: the flags in the order Spent, Received, Uncategorized, joined by "and" with the first capitalized (`Spent and received`), else Movements;
- the words as typed, in one quoted phrase: `matching "Pingo Doce"`;
- the amounts: `of 82`, `of 50 to 100`, `over 50`, `under 20`, joined by "and", with no `of` after a flag (`Spent 50`); each number canonical at its typed precision with thousands grouped, so `1.200` prints 1,200 and `12,50` 12.50, and a separator read the wrong way shows;
- the periods through `named`, after `on` for a day, `from` for a range, else `in`, joined by "and".

`named` prints `March 2026`, `Q4 2026`, `2026`, `Aug to Oct 2026`, `Nov 2025 to Jan 2026`, `Oct 20, 2026`, `Sep 21 to Oct 20, 2026`. Relative words print resolved: `last 3 months` reads `Movements from Aug to Oct 2026`; a blank query reads `Movements`.

The reading is a fixed point, pinned by a test: `reading(parse(reading(q)))` equals `reading(q)`, so the results page title is a valid query too. `named` replaces Money flow's `label` in `-cashflow.tsx`, given the range's first day and the last day of `to`'s month: one period printer for the app.

### Predicates

`holds` compiles the facets once per query:
- a period to millisecond bounds over `time`, both UTC days inclusive;
- an amount or a range to bigint comparisons of `|quantity|`, the row's own asset net of its fee legs, as the Amount column prints it: `over 50` matches 60 EUR and 60 USD alike, and the word `eur` narrows to EUR rows;
- the flags, from `internal(row, type)` and `spends(row, type)`, moved into `src/data/spending.ts` and called by `months()` and the Movements table's fold:
  - `spent`: not a trade, not internal, and an expense category in either sign or no category with money out: the month header's Spent rows;
  - `received`: not a trade, not internal, money in: the header's In;
  - `uncategorized`: not a trade, assignment `open`.

`internal` is the Movements table's fold test and `months()`'s: a paired transfer, or a movement under a `transfer` category, Loans included. Search agrees with the month headers by construction.

### The total

One figure, the same in the palette and on the page, since both call `matching`:
- Spent under `spent`: minus the sum of `worth` over the matches, the headers' Spent of those rows but internal movements' fees and a short pair's shortfall, which the headers count under no category;
- Received under `received`: the sum, the headers' In under its `Summary` name, as on a category page;
- Net otherwise: the signed sum without paired legs (decision 7), so a person reads what was exchanged both ways, Loans included, a merchant what it cost net of refunds, and `savings` never nets a pocket move to 0. It differs from the headers' In minus Out by the transfer-category rows.

It is in the display currency at each movement's day, shown whatever the currencies of the matches, rendered through `Money`.

### The words row

`literal(input, today)` quotes every word the parse read alone as a one-word facet (`march`, `2025`, `4821`, `spent`), or returns undefined; a facet of several words, `q3 2025` or `since march`, is never split. The Movements group shows the result as the words row, with its own count and total, only when it matches a movement: `march` offers `Movements matching "march"`, `may lee` `Movements matching "may lee"`, a pasted `21345 678 123` its quoted digits.

## Interface

**Palette.** Geometry unchanged: the 600px panel, `bg-sidebar/75` over a `blur-glass` backdrop, 80px from the top, the 48px input row, 34px rows, the highlight `bg-fill`. Two fixes to match `design.md`: the input takes `text-nav`, and the lead icon sits in a fixed 20px slot, so `Glyph` and `TokenIcon` labels align. A row's right end never shrinks; its label and note truncate. Placeholder and aria label: Search movements, merchants, accounts and more. No `Kbd` hints, chips, highlights inside rows or preview pane.

**The reading row.** It is the interpretation: quoted parts were matched as words, the rest was understood. The reading truncates at its end; the page title shows it whole. The right end holds the count, then the total as a month header prints it, a label then its `Money` (`12 movements  Spent €84.00`), `dim` like every palette value. Correcting is editing: delete a word, quote it, or take the words row.

**Results page.** `/movements?q=` is a `Page` with no notices, like the merchant page:
- title: the reading;
- action: a secondary `sm` Button, Edit search, calling `refine(q)`;
- `Summary`: the total first (Spent, Received or Net), then Movements, Average, Last seen;
- `Section` Movements: `Movements` with `accounts` and `open`, so no match hides in a fold, grouped by month with each month's Spent, In and Out over the matches (`months(db, rows)`), 50 at a time;
- empty: the section's line `Nothing found.`, a sentence as on every page.

**Keyboard.** Up and Down move, Enter runs, Esc closes, Cmd+K toggles. Digits, `.` and `,` always type. The first row is always highlighted, so Enter on `march` opens the period and on `revolut` the institution. Opened by Edit search, the palette selects its text: typing replaces it, Left or Right edits it.

**Privacy mode.** Every amount in a row, the total and the page go through `Amount` or `Money` and render masked. The reading echoes typed numbers (`over 50`), the user's input, not a balance, and amount filters keep working (decision 5).

**Motion.** Nothing new: the list swaps in place and the panel never moves. **Words.** Sentence case: Movements, Merchants, Categories, Edit search, Nothing found. Ranges read "to". No dashes; the empty value stays `-`.

## Integration

Added:
- `src/data/query.ts`: types, `parse`, `reading`, `named`, `literal`, `holds`, about 230 lines; month names from `Intl`.
- `src/routes/-search.tsx`: movement text, `Built` and its cache, `matching`, `useFind`, about 110.
- `src/routes/movements.tsx`: the results page, about 45, with `src/routeTree.gen.ts` regenerated.
- `src/data/query.test.ts`, `src/routes/-search.test.ts`; `docs/search.md`, this design (decision 11).

Changed:
- `src/core/search.ts`, rewritten, about 100 lines for 40; `search.test.ts` takes over the search test in `core.test.ts`. Categorize calls `search(every, query)` without a limit and gains folding and typos.
- `src/ui/palette.tsx`: `find` and `initial`, a seeded query selected; `quick`, the digit handler and the `Kbd` hint go; the 20px slot, `text-nav`, a right end that never shrinks. `src/ui/command.ts`: `icon` gains a tile form, `{ tile: { hue, icon } | null }`, null being the empty `fill` square (`Blank` in `tile.tsx`) (decision 10).
- `src/routes/-layer.ts`: the seeded palette arm and `refine`. `src/routes/__root.tsx`: the loader returns `rows` and `context`; `Palette` gets `find={useFind(commands)}`, its seed and the placeholder. `src/routes/index.tsx`: Home takes both through `parentMatchPromise`, dropping its own reads.
- `src/routes/-commands.tsx`: Merchants and Categories from the root's data, about 22 lines, and Go to's Movements and keywords (decisions 2 and 12); ids keep, so `MenuBar` still finds its commands.
- `src/data/spending.ts`: `internal` and `spends`, used by `months()`. `src/routes/-movements.tsx`: the fold on `internal`; `kinds` exported.
- `src/routes/-cashflow.tsx`: `label` becomes `named`, about 7 lines fewer. `src/data/ledger.ts`: `partyOf` calls `plain`. `src/ui/combobox.tsx`, in 28d.
- Docs: `foundation.md` (step 28; Later drops the pasted address, which 28a closes), `design.md` (the palette rule, the results page, Categorize's ranking sentence, the Combobox's matching), `ledger.md` (the flags and native amounts in Categories, spending), `ai.md` (one line: search stays local).

Removed: the substring tier, lower-case-only matching, input-order groups, the number keys and `design.md`'s sentence about them, Home's second read of every movement, and in 28d `Combobox`'s collator filter. Untouched: `MenuBar`, `GlassSearch`, and D11's rule that the desktop page handles no shortcut of its own.

MCP: no tool. A model-facing search over bank text, parties and notes is the oracle `ai.md` (Bank text) forbids. `parse` and `holds` are pure, so a typed tool over facets alone stays possible when chat lands, Dmytro's call then.

## Performance and tests

| Step | Budget at 5k movements | Budget at 40k | Measured, synthetic, bun |
|---|---|---|---|
| Build, once per data version | 25 ms | 120 ms | 7 to 21 ms; 51 to 54 ms |
| Movements per keystroke | 0.5 ms | 2 ms p50, 5 ms max | under 0.5 ms; 1 ms p50, 4 ms max |
| Commands per keystroke, about 150, indexed | 0.2 ms | 0.2 ms | |
| Parse | 0.05 ms | 0.05 ms | |

- A movement's field is one flat `Uint32Array` and the scan a plain loop (a closure measured 4 to 5 ms at 40k). The words row adds one scan.
- No Worker, virtualization or debounce below about 150k movements; past that, match distinct texts or intersect posting lists.
- The root loader adds `valuation` (3 reads); Home drops `movements(all)` and its `valuation` (11 reads; `movements(all)` alone measured 557 ms in process at 40k synthetic rows).
- Each step record carries one measurement on the dev data, never a test assertion.

Tests, synthetic only, `host/fresh.ts` where a database is needed:
- `src/core/search.test.ts`: folding both ways; every word must match; the tiers in order; `revolt` reaches Revolut, `uber` never User beside an Uber, `bolr` Bolt but `volt` not, a `known` word no typo; none under 4 letters or on digits; `contni` reaches Continente; group order; `limit`; an address keyword.
- `src/data/query.test.ts`, today Tue 2026-10-20:
  - every vocabulary row; `mar` a word, `mar 12` and `mar 25` days, `oct 2026` a month, `since dec` and `between mar and may` periods; `nov to jan`, `oct to dec`, `march 2025 to may`; `2025` a year, `2045`, `1999` and `march 1500` amounts;
  - `82` takes 82.99 and refuses 83; `82.5`, `12,50`, `1,200`, `2,000`, `1.234,56`, `0.005`, `0,500`; `0042` a word; `over 50` refuses 50.00; `50 to 100` takes 100.00 and refuses 100.01; `50-100`, `50 - 100` and a U+2013 between digits read as `50 to 100`, `"10-20"` as words;
  - `feb 30`, `feb 29`, `20 oct`, `oct 1-15`; stop words; curly and unterminated quotes; `marco` stays a word; every reading a fixed point with no dash, `Pingo Doce` keeping its case; `literal` on `march`, `q3 2025`, `21345 678 123` and an unseen word;
  - the predicates: each flag on paired, transfer-category, refund, fee-only, trade and open rows; periods at both edges, a 23:30 UTC row on Oct 31 in October; amounts and ranges at both bounds.
- `src/routes/-search.test.ts`: every part of the movement text matches, a plain transfer's kind adds no word, amount and date are never text; extending a query never reorders survivors; on a `fresh` database Spent equals the summed `months()` Spent less internal fees and short-pair shortfalls, Received the summed In, and Net leaves out paired legs.
- `src/routes/-layer.test.ts`: `search` toggles with a blank seed, `refine` opens a seeded palette from none only, and neither acts over a prompt.

## Decisions

Answered by Dmytro on 2026-10-21: every one as recommended.

1. **Number keys 1 to 5.** (a) Drop them: digits type, arrows and Enter run rows. (b) Cmd+1 to Cmd+5, against D11 and the browser's tab keys. (c) Only on a blank query, still eating the `2` of `2025`. Recommended: (a).
2. **The results page.** (a) `/movements?q=` with no field of its own, Edit search reopening the palette prefilled (23p). (b) No page, no full list or totals. (c) As (a), the window bar field showing the query. The full list, `/movements` alone, is a Go to row or a URL only. Recommended: (a), off the sidebar, with the Go to row.
3. **People in personal transfers.** (a) Words only: a name matches bank text both ways, and the results page is the person. (b) A derived Person kind from open parties, per-bank prefixes stripped, the Portuguese ones unverified, about 40 lines. (c) A stored person, with a migration. Recommended: (a), then (b) if names prove hard to find.
4. **A single movement.** (a) Its preview row opens the results page, where it stands with its menu. (b) A movement sheet, a new prompt kind. (c) Its actions in the palette, foundation's nested flows. Recommended: (a).
5. **Amount filters.** (a) The row's own magnitude, exact at the precision typed, a currency word narrowing by text. (b) The display currency at the day's rate, priced per keystroke and drifting. (c) As (a), off while privacy is on. A range ends (i) at `to` itself, or (ii) at the end of `to`'s window, `50 to 100` taking 100.50. Recommended: (a) and (i); the reading echoes only typed numbers.
6. **Periods.** Monday weeks; `last N months` and `years` whole units with the current one, as Home's three months; `last N days` and `weeks` rolling; a bare month backward; a 4-digit number from 2000 to this year a year, not only a year holding data, which would tie the reading to the database, so an amount in that span is typed `2,000`. Alternative: such a number also offers its amount as a second row. Recommended: as written.
7. **The total.** (a) One display-currency figure, Spent, Received or Net, the same in the palette and on the page. (b) The native net when every match shares one asset, absent across currencies. (c) The count alone in the palette. Net takes (i) every match, an account's word netting each pocket move to 0, (ii) In minus Out as the headers count, Loans left out, or (iii) every match but paired legs. Recommended: (a) with (iii).
8. **Correcting a reading.** (a) Quotes, plus the words row, about 15 lines. (b) Quotes only. Recommended: (a).
9. **Flags.** (a) Spent, received, uncategorized, as the month headers count them: a Loans or Transfers row is neither spent nor received, so `received simao` leaves out repayments under Loans, which `simao` counts in its Net. (b) Also refunds and to confirm. (c) As (a), `received` taking Loans, unlike the headers' In. `uncategorized` is the category half of the categorize notice's count, so the two numbers differ. Recommended: (a); `received` with a category's name gives its refunds, and Home lists what waits.
10. **Palette leads.** (a) Movement and category rows lead with their `sm` `Tile` as in the table and Categorize, a movement with neither merchant nor category with the table's empty `fill` square: `Command.icon` gains a tile form, no token. Merchants keep their kind icon: the root holds no merchant's category. (b) Plain icons, that movement taking `DashedLineCircleIcon`. Also the window field's search icon in the input. Recommended: (a) and the icon.
11. **Order and home.** Step 28 ahead of 25 Budgets, which keeps migration 16. The design lands as `docs/search.md`, a fifth source-of-truth doc, not split into `design.md` and `ledger.md`. Recommended: both.
12. **One matcher for the palette and Categorize.** Categorize's hints rank with its keywords and a hit inside a word no longer matches; typing shows at most 5 rows per palette group, today every match. Go to rows gain keywords for what their pages hold, about 5 lines: Home money flow, transfers, routes, confirm; Categories merchants, rules; Settings currency, privacy, connect. Recommended: both, in 28a.
13. **28d now or later.** Every `Combobox` on the same matcher, about 15 lines. Recommended: now.

## Plan

Each step ends with `bun check` and `bun test` green, a browser pane check on the Sample Bank account by computed styles and screenshots, its record in `foundation.md` and the docs in the same change, then a stop to report. 28b lands the Movements group and `/movements?q=` as a prototype on the dev data; Dmytro refines them in the app before 28b gets its record and 28c starts.

**28a. One matcher, free digits, merchants and categories.**
- Scope: `core/search.ts` rewritten (`plain`, tokens, the first-letter typo rule, `known`, the name-start tier); Categorize on it without a limit; the number keys gone; the 20px slot and `text-nav`; Merchants and Categories with decision 10's leads; Go to keywords; `partyOf` on `plain`.
- Files: `src/core/` `search.ts`, `search.test.ts`, `core.test.ts`; `src/ui/` `palette.tsx`, `command.ts`; `src/routes/` `-commands.tsx`, `-prompts.tsx`; `src/data/ledger.ts`; docs.
- Done when: the search tests pass, digits type in the palette, Categorize ranks by the new tiers.
- Try it: Cmd+K, a Sample Bank merchant with one letter wrong, an accented name typed bare, then `2`; in Categorize, `restaurnt`.
- About 130 lines added, 50 removed.

**28b. Movements in the palette and the results page.**
- Scope: the root loader returns `rows` and `context`, Home reuses them; `data/query.ts` starts with `Query`, a words-only `parse` and `reading`; `-search.tsx` with `matching`, the Net total and `useFind`; the palette takes `find`, its seed and the search icon; `refine`; `/movements?q=` with `Summary`, `Movements` and Edit search; Go to's Movements.
- Files: `src/routes/` `__root.tsx`, `index.tsx`, `-search.tsx` and its test, `movements.tsx`, `-layer.ts` and its test, `-commands.tsx`, `-movements.tsx`; `src/routeTree.gen.ts`, generated by `bun dev` before `bun check`; `src/data/query.ts`, `src/ui/palette.tsx`, docs.
- Done when: `sample` shows the Movements group with its count, Net and three newest rows; Enter opens the page, Back returns; Edit search reopens the palette with the text selected; a hand-typed `?q=2025` loads; privacy mode masks every amount; one build and keystroke measurement is in the record.
- Try it: `sample`, a merchant word, a name from a transfer; Enter; Edit search; Hide balances; Dmytro, once on the desktop build.
- About 190 lines added, 15 removed.

**28c. Periods, amounts and flags.**
- Scope: the whole `parse`, the sentence `reading`, `literal`, `holds`; `internal` and `spends` in `spending.ts`, shared with `months()` and the Movements table's fold; the Spent and Received totals; the words row; `named` behind Money flow's period name.
- Files: `src/data/` `query.ts` and its test, `spending.ts`; `src/routes/` `-search.tsx` and its test, `movements.tsx`, `-movements.tsx`, `-cashflow.tsx`; docs including `ledger.md`.
- Done when: the query tests pass, the fixed point and the Spent agreement with `months()` included.
- Try it: `spent last month`, `uncategorized`, `over 100 this year`, `aug to oct`, `march` and `"march"`, a Sample Bank amount.
- About 265 lines added, 30 removed.

**28d. The Combobox on the same matcher.**
- Scope: `Combobox` keeps its input uncontrolled, since a controlled one stops Base UI showing the selected label, so `initial` would read blank; it mirrors the text from `onInputValueChange` and passes `filteredItems`, the flat items of `search(options, text, 50)`. `filter` goes; `limit={50}` stays for Base UI's own full list while the input shows the selection. Transfer to, Set merchant, Change rule's category, the kind picker and Add holding fold accents and forgive typos.
- Files: `src/ui/combobox.tsx`, `docs/design.md`.
- Done when: Add holding finds `etherum`. Try it: Add holding on a manual account, a coin with a typo.
- About 15 lines changed.

## Left out, on purpose

- **FTS5 or any SQL search**: a migration, triggers, a round trip per keystroke, no typos, nothing under 3 characters, blind to parties, merchants, categories and pairing.
- **Libraries** (MiniSearch, uFuzzy, Fuse, chrono-node): none reads periods or amounts, and the hand matcher is smaller than the wrapper each needs.
- **Chips, inline highlights, a mirror layer behind the input**: the reading shows the interpretation, quotes override it.
- **Operators and logic**: `key:value`, `>` and `<`, `-word` and `not`, `or`, parentheses, sort words, `k` suffixes, currency symbols (dropped as punctuation), `about` and `~`, `last N quarters`.
- **Binders and Tab completion** (`at bolt`, `in savings`, `from maria`): names are words, and every entity has its own row.
- **Direction words for people** (`from`, `to`, `paid`, `sent`): `received` and the month In and Out say it.
- **Flags that a word, a page or a column gives**: `transfers` and `income` (words those movements carry), `refunds`, `unsure`, `by ai`, `noted`, `to confirm` (Home's section and notice), `trades`, `fees` (the category's name), `out`.
- **Dates the app never prints**: `12/05/2025`, ISO dates, weekdays, `before`, `after`, `until`, `last march`, `aug-oct`; day-first `20 oct` reads 20 in October and `oct 1-15` 15 on Oct 1, as the tests pin.
- **Typo correction toward the vocabulary**: `marco` would read as March. **A top hit row and a fixed group order**: the first row is the best group's best row.
- **Idle suggestions** (Spent this month, Uncategorized), **money flow, saved searches and filter tabs on the results page, the window bar field echoing its query**: worth asking once 28c is in use.
- **Person, period and movement pages**: the results page is all three. **Recents, frecency, pins**: stored state, still Later. **Ask Garner**: waits on chat.
- **Secondary actions, match highlighting, Esc clearing before it closes**: one key, one meaning.
- **A month header linking to its period, the categorize notice linking to `uncategorized`**: one line each, worth asking once 28c lands.
- **Result kinds for rules, imports, saved routes and transfers to confirm**: rows of other pages, reached through Go to's keywords (decision 12); an unheld coin has no page.
- **Cleanups of their own**: the Transfer to dialog's own read of every movement could take the root's rows; the menu bar dims Back and Forward only over a prompt (`free` in `-menubar.tsx`), so Cmd+[ moves the page under the palette.

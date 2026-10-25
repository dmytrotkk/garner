# garner ledger

Imports of bank and exchange exports, transfers between own accounts, categories and budgets, transaction history and taxes. Brainstormed 2026-09-25, reworked 2026-09-30, extended to banks, partial files, categories and budgets and agreed 2026-10-04, categories reworked with the AI categorizer on 2026-10-05, built in steps 16 to 27 of `foundation.md`.

## Why

- Banks and exchanges hold money no address can show. Today they are covered by manual accounts with hand-entered holdings.
- Taxes need every movement of every asset: acquisitions, disposals, fees and transfers between own accounts, each with its fiat value at the time, and a holding period per lot. Rules differ per country, so they are a typed constant per jurisdiction, Portugal first.
- Transfers between own accounts are the edges of the accounts graph, and they carry lots from one account to the next. They also have to leave spending: money moved to a savings pocket is not spent.
- Spending per month, categories and budgets are the part of the graph that touches the outside, and they need every bank row with its words.
- A ledger also rebuilds real balance history back to each account's first fact, which backfills the net worth chart.

## Sources and options

| Option | Privacy | Effort | Automatic | History |
|---|---|---|---|---|
| Manual holdings (built) | nothing leaves the app | none per institution | no | only what is typed |
| Export file import | the file stays local | one parser per format, a `Mapping` constant for a table-shaped bank | no | every booked row: trades, deposits, withdrawals, payments |
| Read-only API key | only the exchange sees the call, and it already knows the balance | one signer per exchange (Coinbase JWT, Kraken HMAC), key in the host, later the Keychain | yes | yes |
| Aggregators (CCXT, CoinTracker) | CCXT is local but huge, hosted ones see everything | low | yes | yes |

Direction: export imports (this doc), banks before exchanges. Read-only API keys per exchange later as an `exchange` account kind with a view-only key and an IP allowlist. A bank API adapter, later, is a fetch plus a `Parser` over the response, each pull kept as an import.

The first five sources:

| Source | Parser | Label | Unit | Printed balance | Step |
|---|---|---|---|---|---|
| Revolut | code | Product | Currency | every completed row | 16 |
| ActivoBank | `Mapping` | account number from the title line | preamble currency (Moeda) | every row (Saldo) | 21 |
| Santander Portugal | `Mapping` | none, one account per export | the header, `Amount( EUR )` | every row | 21 |
| Kraken | code | none, the wallet is a part | printed asset | every row, per printed asset and wallet | 26 |
| Coinbase | code | none | Asset | none | 26 |

## Facts, user state and derived values

Three kinds of fact, for every account kind. Nothing derived is ever stored.

- A kept file, table `import`: the export as garner read it, plus how it was read (the ticker map and the label to account route, both frozen at apply). The source of every imported entry and every file observation.
- A movement, table `entry`: a signed change of one asset in one account at one time, grouped into events by `ref`. Written by imports, by hand (a recorded purchase), and later by the on-chain indexer. Imported entries are rebuilt from the kept files on every apply and remove.
- An observation, table `balance`: the absolute quantity of one asset in one account at one time. Written by sync for addresses, by a typed holding for manual accounts, and by apply from a printed balance cell. Never derived: a file observation exists only where one printed cell is the whole (account, asset) quantity.

User state on top, none of it derivable:

- A decision, table `decision` (migration 14): the answer for one transfer leg, `external` or `paired` with the other leg's key, one row per pair keyed by the sending leg. Keyed like the entry and without a foreign key to it, so a rebuild never loses it.
- A saved route, table `route` (migration 15, step 24): a sending and a receiving account, one row per direction, gone with either account. Exact counterparts between the two pair on their own.
- A category, table `category` (migration 10): a purpose, with a type (expense, income or transfer), an icon and a hint.
- A rule, table `rule` (migration 10): the category of every movement of one party, the user's or the AI's. It does not depend on leg keys, so it survives anything a re-export does.
- A choice, table `choice` (migration 10): the user's category for one movement, keyed (accountId, ref) without a foreign key to the entry.
- A note, table `note` (migration 10): the user's words on one movement, keyed like a choice.
- A budget, table `budget` (migration 16): a target per category from a month on.

Decisions, routes, rules, choices, notes, identities and budgets are replaced whole by their key and carry no `updatedAt`. A `holding` kind, `derive`, an `expect` guard, an override table and a link table stay out of stored state.

Everything else is a pure function over facts and user state, computed on read: `plan` (what an import would write), `fold` (closings, history, coverage), `pair` (transfers; `mirrors`, their virtual legs, with the first rowless own account), `flows` (the graph), `assign` and `queue` (categories and the AI's work), `spending`, and `lots` (lots and tax rows). `Coverage`, `Transfer`, `Assignment` and `Flow` exist only as their results.

## Statements and parsers

A parser is code and is never stored: `detect` plus `parse`, text in, `Statement` out. Its output is never stored either, so its shape grows with the sources: `Row` has no `part` and `Leg` no `internal` kind until Kraken, and `Skip` is `pending` and `reverted` until a source needs more.

The types (`Doc`, `Leg`, `Row`, `Skip`, `Statement`, `Parser`) live in `src/data/statement.ts`, and `Kind` (`entry.kind`) with the row types in `schema.ts`. `detect` and `parse` take the text `view` renders.

- `Doc` is one file as text. `open` and `view` are the only places that know containers: `open` decodes text as UTF-8, else Windows-1252, and keeps it verbatim, preamble included, and keeps a compound file (the OLE2 magic) as its bytes in base64 text; `view` renders such a file to a tab separated table through `xls.ts` on every read, before detection and parsing (see `import.raw`).
- `label`: the account as the file names it (Revolut Product, a Portuguese account number from the preamble), `''` when the file is one unnamed account. A label routes to an account.
- `unit`: a currency code or a printed ticker. A fiat unit is never looked up in the coin list: GEL, SOS and TOP are both currencies and tokens.
- A series is the subject of one running balance as the file defines it: (label, unit). Kraken adds a part, its wallet, which never routes to an account.
- `amount` and `balance` are exact integers at 18 decimals, the scale of every canonical asset after migration 7. No float.
- `legs` together move the printed balance: `balance = previous + sum(legs)`. `balance` is null where the source prints none.
- `peer`: the other side's account identifier, when the file prints one as such. `memo`: the row's words.
- `skipped` counts the rows left out, by reason. `unknown` counts the rows of a type the parser does not know, by printed name.

Code: `src/data/statement.ts` (the types, `open`, `view`, `cells`, `heading`, `reader`, `chain`, `instant`, `keyed`), `src/data/xls.ts`, `src/data/xlsx.ts`, `src/data/parsers/`, `src/data/imports.ts` (`read`, `plan`, `applyImport`, `removeImport`), `src/data/ledger.ts` (`fold`), `src/routes/-import.ts` (`ImportFlow`), `src/routes/-import-dialog.tsx` (the preview), `src/data/categories.ts` (step 23), `src/data/spending.ts` (`months`), `src/data/transfers.ts` (`pair`, `decide`, `undecide`, `saveRoute`, `forgetRoute`, `savedRoutes`), `src/data/flows.ts` (`flows`, `routes`), `src/data/merchants.ts`. A `Parser` also carries the `name` its bank is called by, which names new institutions and accounts.

### Detection

An exact header match per known generation, cells trimmed and compared without case; no match is refused with the file's first line shown. Revolut exports follow the app language (header, Type, Product and State are translated). Only the English export is read (step 16), by position: another language adds its header, its product names mapped to the English labels, its types and its states, on a real file.

### The rules every parser follows

1. Settled rows only, and the state column decides where the file has one: a pending or reverted row is counted in `skipped` and is never a row, and a state the parser does not know is refused. A booked row that moves nothing is a row without legs.
2. Every row is keyed from itself. A move one file prints twice (a Revolut pocket move) is two rows with two refs.
3. The legs of a row add up to its balance change. A fee column is a `fee` leg of the same row, and the transfer leg is what crossed, net on a withdrawal and gross on a deposit the institution credited net, so a fee-netted transfer still pairs as exact. An amount withheld on income is a `fee` leg under the income's ref, never netted, so interest and dividends keep gross and tax.
4. The sign decides before the type. A positive fee or a negative income becomes a `transfer` leg. The leg builder never throws on sign. A zero leg is dropped and the row's other legs stay, so a row with amount 0 and a fee keeps its fee leg. Nothing the CHECKs reject is built.
5. An unknown type is a `transfer` leg, counted by its printed name and named in the preview. The amount is known, so the balance holds; the meaning is not, so the leg stays unmatched.
6. `chain` only orients a series: file order or its reverse, whichever explains more transitions of the balance column. It throws only when neither direction explains most of them, and on a tie it keeps the order it is given, so `table` hands it rows oldest first, since table banks print newest first. A break inside a file is left to the daily observations and shows as a hole. Rows stay oldest first per series in the file's own ledger order, never sorted by time.
7. An unreadable cell throws with its row number and the name of its column, never with the cell: a wrong date order is worse than a refusal, and a shifted row must not put a description into an error.
8. The balance column is the check and never part of a key.

### Mapping constants for table banks

Code where a source needs logic, a `Mapping` constant compiled by `table(mapping)` (`src/data/parsers/table.ts`) into the same `Parser` where the bank is a table. Santander and ActivoBank differ only in data.

`Mapping` holds the id, the bank's name, the header, the date, memo, amount and balance column positions and the fixed unit, frozen on Santander's real file (2026-10-05) with only what that file needed. The table is the rendered sheet, tab separated; the header row is found anywhere below the preamble, cells trimmed and compared without case; columns are read by position; the date is `dd-mm-yyyy`; amounts are read as printed; every row is a `transfer`, `label` is `''` and `unit` is fixed, since the header names the currency. ActivoBank's export (2026-10-12) forced `unit` and `label` read from the preamble: each is a `RegExp` tried on every line above the header, cells joined by tabs, the first capture winning, else `The currency is not in the file.` or `The account number is not in the file.`; `unit` stays a string where the header names it. It grows one variant at a time, each forced by a real file: a debit and credit pair (CGD), a currency column, an id column, a peer column, a kind rule. A table statement has no type column, so until a kind rule exists every row of a table bank is a `transfer`.

### Keys

`ref` groups the legs of one event, `leg` names one movement in it. A key is (accountId, ref, leg).

| Family | `ref` | `leg` |
|---|---|---|
| Event id and row id: Kraken | `kraken:<refid>` | `<txid>`, `<txid>:fee` |
| Row id: Coinbase | `coinbase:<ID>` | `amount`, `quote`, `fee`, `funding` |
| No id: Revolut, Santander, ActivoBank, any `Mapping` | `row:<stamp>:<unit>:<amount>:<n>` | `amount`, `fee` |
| Recorded by hand | `user:<uuidv7>` | `asset`, `quote`, `fee` |
| On-chain, later | `eip155:<chainId>:<txhash>` | `log:<index>`, `native`, `internal:<index>`, `gas` |

The row key holds only what the row says: no source name, no description, no balance. A reworded text, a restated balance, a new format generation or a second file type of the same account cannot re-key it, and the balance stays an independent check, so a key failure is a visible hole and never a silent duplicate.

- `stamp`: the parsed civil date and time of the booking cell, zero padded as `YYYYMMDD` or `YYYYMMDDHHMMSS`. Never passed through a time zone and never the printed digits: `2021-09-06 6:11:59` and `2021-09-06 06:11:59` both give `20210906061159`, and `30-03-2026` gives `20260330`.
- `unit`: the currency code or the printed ticker.
- `amount`: the canonical signed decimal, trailing zeros trimmed, fee excluded: `-2.65`, `300`, and `0` for a row that only carries a fee.
- `n`: the occurrence, from 0, among the file's rows with the same label, stamp, unit and amount, in chain order.

Honest limits:

- Twins (same label, stamp, unit and amount) are told apart by order only, so their memo and a decision, a choice or a note on one of them can swap if the bank reorders them. Money is unaffected.
- A file that holds a later twin of one instant without the earlier one miscounts `n`. Whole-day windows cannot do this.
- A bank that changes the date or the amount of a booked row makes a new row beside the old one. This case and the previous one show as a hole at the next observation.
- A source without a balance column has no check.
- Two accounts of one source whose files do not name them (label `''`: two Kraken or Coinbase logins) cannot share an institution, since the second file is routed to the first account. A second login goes into an institution of its own.
- The label is not in the key, the account is. So two labels of one bank in an institution may not share a target, and `plan` rejects, with the row, two rows of one file that produce the same (account, ref, leg).
- The two halves of an exchange never share a ref: each is a `trade` leg under its own row key, since the other half sits in the other currency's file. No decision hangs on a trade leg, so this can change by rebuild. An exchange whose other currency is not imported leaves its account and appears in no flow.
- A decision whose key no longer exists (twins reordered, a restated row, a removed import, a parser fix) is counted in the preview and listed on the account page with one action to drop it. Nothing reattaches it.

Keys freeze per parser only after a golden key test, an unpadded hour and a day-first date included, and two overlapping real exports that join with zero duplicates and zero holes.

### Time

`time` is the booking time, the one the balance follows: Revolut Completed Date, the Portuguese movement date. Milliseconds.

- A source that prints UTC (Kraken, Coinbase) is stored as printed.
- Wall-clock text is stored as printed too, its fields read as if they were UTC: statement time. No zone column on `import`, no clock field on `Parser`, no zone argument. The stored day is the printed day, and the instant can be off from true UTC by the bank clock's offset. If true instants are ever needed, a nullable `import.zone` and a rebuild add them, keys untouched.
- A date-only row sits at 12:00 UTC of its printed date plus its position in the day in milliseconds, so the stored day is the printed day and the bank's order survives.
- A row stamped ahead of the clock (a bank east of UTC, imported within its offset of the booking) counts in the totals at once and in history from its own day, so the two can differ until that day begins in UTC.

## Imports

```
open         bytes to Doc
view         kept text to rendered text
detect       text to Parser
parse        text to Statement
plan         kept files of the institution, added files and Route to Plan
applyImport  Plan to one write
fold         entry, balance and mirrors to closings and Coverage
```

The user exports a file from the bank or the exchange and drops it on an institution, one file or several. Nothing is written before a preview is confirmed. Several files are a batch: each file gets its own preview, in order, titled with its place (Import 2 of 3), a later file reads the earlier ones as kept, an unknown file fails only its own step, and Cancel or Esc skips to the next file. Entry points: Import file in the palette, in the actions of an institution and of a manual account, and on the Fiat page, a drop of files anywhere on the window (on the page of a manual account it starts from that account), and an Imports section on the institution page. An import started from an account lands back on it when it goes to that account's institution, any other on the institution page.

### Route

An import feeds accounts through a route frozen on its row: `import.accounts` maps each label of the file to one manual account, fixed at apply like `tickers`, so a rebuild never depends on today's account list or on the app language of a later export. The import has no institution column: its institution is the institution of its targets, and all targets of one import lie in one institution.

Bank products are accounts: Revolut Current and Savings are two manual accounts in one institution. Every printed bank balance then observes exactly one (account, asset), an opening is never mistaken for missing rows, and Savings is a node of the graph. Exchange sub-wallets (Kraken spot and earn) are parts of one account, so an exchange stays one pool.

```ts
export type Target =
  | { state: 'account'; accountId: string }
  | { state: 'new'; accountId: string; name: string }
export type Route = Readonly<Record<string, Target>>
```

`Route` holds one target per (parser, label) that no kept import routes yet, so two banks' unnamed accounts dropped together stay apart. The rules:

1. A (parser, label) that a kept import of the institution already routes keeps its target and is not a control in the preview. A free control there would split one product over two accounts and count the overlap twice with no hole.
2. A label new to the institution is a control with a default: the manual account the import was started from, when the added files bring a single new label and no kept file feeds that account, else the manual account of the institution already named like the account it would create (so a file removed and imported again finds its accounts), else a new account.
3. A new account is named after the bank and the product (`Revolut Savings`, `Santander`); a label that is an account number shows only its last four digits (`ActivoBank ••8901`, Dmytro 2026-10-18), since account names are tool output and a re-import finds an account by its name. The full number stays in `import.accounts`.
4. Two labels of one bank in an institution may not share a target, in one file or across files. The label that held the account first keeps it, kept files before added ones.
5. A route to a removed account counts as unrouted and is asked again, and the answer replaces the dead target in `accounts` of every kept import that names the label.
6. A second Revolut language maps its product names to the English labels, so a language change between two exports does not split a product.
7. A file dropped outside an institution defaults to the institution that already holds imports of its parser, else to the institution named like the bank, else to a new institution with that name. Changing the institution is a new pick. A second login of one bank goes into an institution made first and imported from its page.

### Plan

One pure `plan(draft, route)` sits behind preview, apply and remove, for one institution. It takes statements, never parses and never throws.

- `Draft` is what `read` produced: the institution (existing, or new with its id and name), every kept import and every added file with its parsed `Statement`, the import being removed if any, the institution's manual accounts, the balances stored for them, and one control per label that no kept file routes, with the id and name of the account it would create. `read` mints the ids of new imports, accounts and institutions, so the plan's entries are final. Not in it yet: ticker maps (a file with a unit that is not a currency is refused until step 26), `user:` entries (none are written before step 27) and decision keys (step 22).
- Rows are routed (kept files by their frozen `accounts`, added files by the route) and joined by (account, ref, leg). Among overlapping files the newest wins a shared row: the one whose last row is later, not the one applied last, and on equal last rows the one with the greater id. Its memo, time and ticker map are the ones stored.
- Entries are built with each file's own ticker map, so the result never depends on today's coin list.
- File observations are built, and the result is folded with the institution's `user:` entries and the typed balances outside the windows, so the preview shows each line's `Coverage` before anything is written. It folds without the virtual legs of paired transfers, since pairing needs every account, so a line can differ from the account page where a transfer waits for its other side.
- `Plan` carries the route, the import rows, the entries and observations to insert, the delete scope, one line per (account, asset) with new and known rows, closing and coverage, the skipped and unknown counts, how many typed holdings the files replace, later how many decisions lose their row, the import ids it was computed from, and `blocked`.
- `blocked` is null or the one reason Import is disabled: nothing new (no entry or observation would be added or changed), a label without a target, two labels of one bank sharing a target, or two rows of one file producing the same (account, ref, leg), named with the row.

### Apply and remove

`applyImport(db, plan)` is one write:

1. It refuses when the institution's imports changed since the read, compared by import ids (a second tab, an MCP tool).
2. New institution, accounts and assets, then the import rows.
3. Delete, over the institution's files as they were before the change (kept plus removed plus added): the entries of every account those files feed whose ref is not `user:` or `eip155:`, and the observations inside their windows.
4. Insert, only from the files that remain: the plan's entries and observations.

`removeImport(db, id)` is the same write with the import among the removed, so its entries and its observations go with it, also when it was the only file feeding an account. Removing an account also deletes the imports that feed no account any more. It routes nothing: a label whose account was removed stays without a target, drops out of the kept file's `accounts`, and is asked for by the next import, so a removal never creates an account. A file that routes no label (no booked row) is not stored, and neither is a file whose text is already kept.

- The entry write is a plain insert, never insert or ignore. After the delete a conflict can only be two different rows under one key, and OR IGNORE would also swallow a CHECK or NOT NULL failure. Either aborts the write and shows as `failed`.
- The observation write replaces a same-day row only when its time is later.
- `user:` and `eip155:` entries are never touched.

### Partial windows

Any window is accepted. How a partial Kraken window reads is decided on a real partial export (File observations). A real export usually opens with a non-zero balance, so a partial window is the normal case.

- A window is the span from the first to the last row of one (account, asset) in one file.
- Files join by key: re-importing a file or importing overlapping exports changes nothing.
- The first observation gives the opening, a later observation that differs from the running sum is a hole. Nothing refuses a running sum below zero.
- A product or part that appears in no kept file is invisible. A file's rows do not state its window, so after the last row "no activity" and "not exported" look the same, and a typed balance is the check.

### File observations

One per (account, asset) and day with rows: the printed balance after the day's last row in ledger order, stamped with the latest time among the day's rows, so it sorts after all of them in the fold. Stored in `balance`.

- They exist only where one printed cell is the whole (account, asset) quantity, which is every bank.
- A source with parts (Kraken) writes none: a sum over parts is computed, not printed. Its series chains are checked inside `plan`, and partial Kraken windows are decided on a real partial export. A source without a balance column (Coinbase) has none.
- Files own observations only inside their own windows. Across files the later time wins its day, and on a tie the newest file.

### Coverage

```ts
type Hole = { from: number; to: number; quantity: bigint }
type Coverage =
  | { state: 'outside' }
  | { state: 'ledger'; from: number; to: number; opening: bigint; holes: readonly Hole[] }
```

- Coverage belongs to a line, one (account, asset). `outside`: a line with observations alone. It has no entries, so the ledger says nothing about it, and one account can have a line in the ledger and another outside it.
- `from` and `to`: the times of the line's first and last fact.
- `opening`: the first observation minus the movements at or before it, the quantity the line holds at `from` before anything moves. Zero for a line that starts from nothing or has no observation. It needs no time of its own, since that is always `from`.
- A hole: a later observation that differs from the running sum, between the previous observation and that one, with the difference as its quantity. With daily file observations a hole is located to its day, and it closes when the file that covers it arrives.
- Coverage is computed the same way for every asset. Whether an opening or a hole is a tax issue is decided in `lots`.
- Shown on the account page under its movements: per line in the ledger its currency, the range from its first to its last fact and a non-zero opening, then each hole.

### Typed balances inside windows

Typed holdings stay observations. Apply deletes the ones inside the files' windows, where the file states the balance: the preview says how many (every stored balance the write removes that is not a kept file's own observation, a same-day balance typed before the file's last row of that day included), and removing the import does not bring them back. A balance typed outside every window stays as a free check and shows as a hole where it disagrees with the running sum.

### The preview and `ImportFlow`

The preview is the plan on screen: one line per account and asset with rows, date range, net change, closing and coverage, new against known rows, skipped rows and unknown types by name, the targets that are controls and how many typed holdings the files replace; unresolved tickers join in step 26 and the decisions that lose their row later.

```ts
export type ImportFlow =
  | { state: 'reading'; pick: number }
  | { state: 'invalid'; error: string }
  | { state: 'preview'; draft: Draft; plan: Plan }
  | { state: 'applying'; draft: Draft; plan: Plan }
  | { state: 'failed'; draft: Draft; plan: Plan; error: string }
export type ImportEvent =
  | { type: 'pick'; pick: number }
  | { type: 'read'; pick: number; draft: Draft; route: Route }
  | { type: 'reject'; pick: number; error: string }
  | { type: 'route'; route: Route }
  | { type: 'apply' }
  | { type: 'fail'; error: string }
```

- `next` in `src/routes/-import.ts`. `pick` starts a new read from any state but `applying`.
- `reading` carries the pick number, so a read that answers an older pick is ignored.
- Reading opens, detects and parses every kept and added file into the draft and resolves the tickers of the added ones. Everything that can fail fails here, as `reject` naming the file: an unknown header, an unreadable cell, a balance column that follows its rows in neither direction, a kept import the current parsers no longer read. `plan` only sees statements, so `next` is total.
- `route` changes targets only. An institution change is a new `pick` with the same files.
- `apply` is accepted from `preview` when nothing blocks, and from `failed` as a retry. A refusal because the institution's imports changed shows as `failed` and says to start again: a retry of the same plan is refused again, a new pick (the institution menu, or a new import) reads afresh.
- Success closes the dialog through `Layer`, so there is no done state. The machine lives per dialog mount. `mapping { doc, error }` joins between `reading` and `preview` with the step for unknown files.

## Data model

Migration 7, applied in step 17 after a backup of both databases, its SQL in `src/data/schema.ts`: `asset` and `balance` are rebuilt with the migration 2 pattern (create, copy, drop, rename), since a CHECK cannot be altered and a NOT NULL `time` with a computed value cannot be added in place; `account.syncedAt` and the `mcpToken` row go; `import`, `entry` and `decision` arrive.

| Table | Column | Note |
|---|---|---|
| `asset` | `canonical` | Replaces `parent`: a canonical row points at itself and a deployment at a canonical row, never at itself or at another deployment, so the column is a canonical id by construction and the coalesces and casts go. The rebuilt table names `asset` in its own reference from the start. Apple's SQLite runs with `legacy_alter_table` on, and there a rename with foreign keys off leaves a reference to the old name; upstream rewrites it. Naming `asset` is right on both. |
| `asset` | `decimals` | Fiat rows move from 2 to 18, since Kraken EUR amounts carry 4. |
| `balance` | `time` | When the quantity was observed. Orders facts in the fold and lets a newer observation win its day: sync and file observations replace a same-day row only when their own time is later, and sync compares what it read with the latest observation before its own time, so a run that read the chain earlier still records its day. A typed holding always replaces its day. The CHECK ties `day` to `time`. Migrated rows sit at the last millisecond of their day, and today's row at the migration time, so a sync later that day still wins. |
| `balance` | `quantity` | Signed for `fiat:*` only: an overdrawn statement prints a negative balance. Copied as it is, with no scaling branch: sync writes chain assets only and `setHolding` writes 18 decimals whatever `asset.decimals` says. A `fiat:*` row in the old table fails the migration to be looked at: the copy selects null for it and the NOT NULL rejects it. |
| `account` | `syncedAt` | Dropped, unread since step 12. |
| `setting` | `mcpToken` | The row step D2 left behind goes. |
| `import` | `id` | UUIDv7, minted at reading. Not an order: the newest file is the one whose last row is later. |
| `import` | `name` | The file name, shown under Imports. |
| `import` | `raw` | The file as read. Text is kept verbatim, preamble included, since a rebuild re-detects and re-parses from it. A binary container (a spreadsheet) is kept as its bytes in base64, since both hosts refuse blobs, and `view` renders it on every read, so a reader fix reaches old imports by rebuild. |
| `import` | `tickers` | Printed ticker to asset id, frozen at apply. `{}` for bank files. |
| `import` | `accounts` | Label to account id, frozen at apply. The only link from an import to its institution. |
| `entry` | `accountId`, `ref`, `leg` | The key. Deduplication is the primary key and nothing else. |
| `entry` | `time` | The booking time in milliseconds: UTC where the source prints UTC, statement time otherwise. |
| `entry` | `kind` | Four values, frozen here. |
| `entry` | `assetId`, `quantity` | A canonical signed integer in base units: no leading zeros, no `-0`, never zero. `fee` is below zero, `income` above, `trade` and `transfer` either. |
| `entry` | `peer` | The other side's account identifier when the file prints one as such: an address, an IBAN, an account number. Null for the first three banks and for Kraken. Aliased like an address before any AI output. |
| `entry` | `memo` | The row's words, verbatim after trim, cells joined with one space. Normalized only on read. Never tool output. |
| `route` | `fromId`, `toId` | A saved route between two own accounts, one direction, no self route. |
| `decision` | `kind`, `peerAccountId`, `peerRef`, `peerLeg` | `external`: nothing of mine on the other side. `paired`: the receiving leg's key, the row keyed by the sending leg, unique on both keys. A leg cannot be a transfer to its own account. |

- An `import` row exists only once applied. Its format is detected, never stored.
- Kinds:
  - `trade`: one leg of a swap or an exchange. A trade against fiat has a `fiat:*` quote leg, which is where the cost lives.
  - `fee`: in any asset, sharing `ref` with what it paid for. Also an amount withheld on income.
  - `income`: staking, earn rewards, interest, airdrops.
  - `transfer`: in or out of the account, the sign gives the direction. Deposits, withdrawals, payments, exchange adjustments, Coinbase funding, and every row of a type the parser does not know.
  - Kraken's moves inside one account (earn allocations, spot to staking) make no entry: they are dropped by a (type, subtype) table after the raw chain check, not netted inside a ref, since its legacy staking legs share no refid.
- `decision` is replaced whole by either key it names: `decide` deletes every row keyed by or naming either leg before it inserts. Pairs a tier finds are not stored.
- Typed holdings stay observations: `setHolding` upserts the day's `balance` row with the current time, removing one writes 0. Add holding takes an optional day it was held since: the amount is written on that day at 12:00 UTC (never later than now) and again now, so history counts it from that day and the current amount holds even after an earlier removal of the coin; a day after today is refused. They carry no cost, so they never make a lot, and they stay unsigned, so a negative balance only comes from a file.
- A negative balance subtracts from net worth and shows no share; that look and fiat split from crypto in the totals shipped in step 19.
- Recorded purchases are `trade` entries written by hand: an asset leg and a fiat quote leg at a chosen time, in the account where the coins were bought (a manual account for a closed exchange or a P2P seller), and the deposit that brought them here is paired to that account by decision, so the quantity is never counted twice. They are the only hand-written entries.
- Tickers resolve through the Kraken override map (`XXBT` is bitcoin, a staking or earn suffix is the base coin), then held assets by symbol, then the coin list by best rank. A ticker that resolves to nothing becomes the unpriced canonical asset `ticker:<SYM>` (`CanonicalId` grows a third form), never skipped: a skipped row is a disposal the tax report never sees. It is hidden as dust like any unpriced position.
- Prices (step 18). A gap is an (asset, day) before today without a stored price, on which the asset was held or which belongs to a rated currency: the display currency and `Rule.currency`, rated for every day of the history range. A held day is one with a closing that is not zero, so an overdrawn day counts, and a currency is also priced on every day it moves (changed and spent within one day), and gaps start at the asset's first held day, so imported years are valued at their own prices. Sources by asset class: `coingecko:` from DefiLlama, per asset in windows of 500 days counted back from now (its chart refuses more than 500 points); `fiat:USD` is 1, stored like any price and never requested; any other `fiat:` from Frankfurter in one request per currency, a closed day taking the last business day; anything else (`ticker:`) is never asked. Five requests run at once and a lane ends at its first failure. A day asked for and not answered is not asked again until the app restarts; a failed request or a failed write is forgotten and retried by the next sync.
- A rate is a fact of the day the ECB published it. Frankfurter's latest rate is the last published business day's and carries that date, so sync and `setCurrency` store it under that day and never under today: asked before the afternoon publication it is the previous business day's, and as today's row it would stay for good. Closed days get their rows from the range, for days before today. A coin has a spot price for today on every sync, a held currency its latest published rate, and a held dollar its 1.
- Limits of the price sources. DefiLlama's daily chart reaches back to mid-2018, so earlier days of a coin stay unpriced and count 0 in history. Frankfurter v1 lists 30 currencies, the ECB's set, enough for now (answered 2026-10-04), so the provider path stays on v1; a currency it does not list stays unpriced and costs two failed requests and one of the five lanes per sync, so five such currencies would stop the past days of every asset. The carry over closed days has no limit, so a currency the ECB stops publishing would keep its last rate.
- Prune counts entries as holders, so a coin held only through another account's entries keeps its prices.
- Left out until needed: a provenance column on `balance`, an account kind for banks, an institution on the account (the tax forms need the platform's entity and country), a value date, the original amount of a card payment, the source's type, a tx hash, a zone, a fee column (fees are legs), a fiat value column (the quote leg carries the cost). The kept file has them, so each is one migration and a rebuild, never a re-export.

Migration 8, in step 18, changes no schema. Builds before that step stored the latest rate under the day of the sync, so a weekday row can hold the previous business day's rate. It deletes those rows, except each currency's newest, which `display` needs until the next sync refills the rest from the range.

Migration 10, with categories in step 23 (reworked 2026-10-05, replacing the planned `decision.categoryId` and pattern `party`):

```sql
create table category (
  id text primary key,
  name text not null unique collate nocase check (name <> '' and name = trim(name)),
  icon text not null check (icon <> ''),
  type text not null check (type in ('expense', 'income', 'transfer')),
  hint text not null check (hint = trim(hint)),
  updatedAt integer not null
) strict

create table rule (
  party text primary key check (party <> '' and party = lower(trim(party)) and party not glob '*  *'),
  categoryId text references category (id) on delete cascade,
  source text not null check (source in ('user', 'ai')),
  check (categoryId is not null or source = 'ai')
) strict, without rowid

create table choice (
  accountId text not null references account (id) on delete cascade,
  ref text not null check (ref <> ''),
  categoryId text not null references category (id) on delete cascade,
  primary key (accountId, ref)
) strict, without rowid

create table note (
  accountId text not null references account (id) on delete cascade,
  ref text not null check (ref <> ''),
  body text not null check (body <> '' and body = trim(body)),
  primary key (accountId, ref)
) strict, without rowid
```

Plus one insert of the seeded categories, their ids literal UUIDv7 strings.

- `category.type`: user intent, not derivable. Without it a month that holds only a refund flips Groceries to the income side, and a pocket move would read as spent.
- `category.hint`: one line on what goes in, read by the model. Names alone are ambiguous (where does a gym go?).
- `rule.party`: `partyOf` output, matched by equality. `categoryId` null is the AI's unsure, never a user rule.
- `choice` and `note` key a movement, not a leg: a fee follows its purchase.
- Removing a category cascades its choices and rules: a movement chosen for it falls back to the rule of its party, if one is left, and any other is open again.

Migration 11 seeds the four categories of step 23e with `on conflict do nothing`, so a category the user already named that way stays theirs, and rewrites three seeded hints only where they still hold the seeded text. Migration 12 seeds Car the same way and trims fuel, parking and tolls out of the Transport hint where it is unedited. Migration 13 adds `merchant` and `identity` (step 23h), migration 14 rebuilds `decision` as the external or paired union (step 22a) and migration 15 adds `route` (step 24).
Migration 16, with budgets in step 25:

```sql
create table budget (
  categoryId text not null references category (id) on delete cascade,
  month text not null check (
    month glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and month || '-01' is date(month || '-01')
  ),
  assetId text not null references asset (id) check (assetId glob 'fiat:*'),
  quantity text not null check (quantity = '0' or (quantity glob '[1-9]*' and quantity not glob '*[^0-9]*')),
  primary key (categoryId, month)
) strict, without rowid
```

A row is a target valid from its month until the next row. A `0` row ends it. The glob keeps a signed year out, since months compare as text.

Later, each in place and with its own step:

```sql
create table identifier (
  value text primary key check (length(value) >= 8 and value = lower(value) and value not glob '*[^0-9a-z]*'),
  accountId text not null references account (id) on delete cascade
) strict, without rowid

alter table import add column mapping text check (mapping is null or json_valid(mapping))

alter table import add column zone text check (zone is null or zone <> '')
```

- `identifier`: with the first source that prints a counterparty bank account (an IBAN or an account number). Account numbers found in preambles are already route labels and seed the table then.
- `import.mapping`: with the mapping step for unknown files.
- `import.zone`: only if true instants are ever needed.

The planned SQL was checked in memory on upstream 3.53.4 and Apple's 3.54.0 on 2026-10-04; each migration runs on both builds again before it ships (`foundation.md`, Architecture).

## Fold

`fold(moves, observations)` in `src/data/ledger.ts` gives the closings and the `Coverage` of every (account, asset), as one `Line` each. `moves` are the entries and, later, the virtual legs of paired transfers (`mirrors`), which the caller appends. `ledger(db, institutionId?)` reads both tables and folds them; `portfolio`, `history` and `backfill` read closings through it, the account page its `Coverage`, and nothing writes them. `movements(db, scope)` is the one reader of grouped rows beside it, for one account, one institution, every fiat line, everything, one merchant or one category, the last two filtered after the full read. A ref whose legs differ in time or asset, or whose first leg is a fee, does not occur in bank files and is settled with the first exchange parser (step 26).

- Per account and asset: facts plus, later, the virtual legs of paired transfers (`mirrors`), ordered by time, movements before observations on ties. An observation sets the running quantity, a movement adds.
- One closing per line and day that has a fact. Closings start at the first fact, from the opening.
- A line with observations alone is `outside` the ledger and its closings are its observations.
- Sync prices what manual accounts hold from the same lines, so a coin held only through entries is priced like a typed one.
- Display folds per deployment. Holes, pairing and lots fold per canonical asset, so a bridge inside one address nets to zero.
- A running sum below zero is a closing like any other: an overdraft, or a window that starts after the money arrived.
- A virtual leg in a statement-backed account that the statement does not confirm shows as a hole on its day.

## Transfers and the graph

Step 22a (2026-10-07) pairs legs, step 22b (2026-10-07) derives the flows and lists the routes.

`pair(legs, decisions, routes)` in `src/data/transfers.ts` gives every transfer leg one state, over every account at once. A leg is a `transfer` entry with its canonical asset, its exact quantity and its party.

```ts
export type LegKey = { accountId: string; ref: string; leg: string }
type Verdict = { state: 'external' } | { state: 'paired'; with: LegKey }
type Decision = { key: LegKey } & Verdict
type Fit = 'exact' | 'short'
export type Candidate = { with: LegKey; fit: Fit }
export type Via = 'user' | 'twin' | 'route'
export type Transfer =
  | { state: 'unmatched' }
  | { state: 'proposed'; with: readonly Candidate[] }
  | { state: 'paired'; via: Via; with: LegKey; sent: bigint; received: bigint }
  | { state: 'external' }
```

`with` is the other leg. `sent` and `received` are the two quantities as printed, so a shortfall is visible where it is shown.

Fit, between an outgoing and an incoming leg in two own accounts with the same canonical asset:

- `exact`: received equals sent.
- `short`: received below sent by at most the larger of 1.5% and a floor, 1 unit of a currency but never more than a twentieth of the amount, or a tenth of a coin amount (tightened 2026-10-12 from 1% and 10 units: on real data the 10 unit floor matched small purchases against unrelated rows in other accounts; 1.5% keeps a 200 to 197 exchange withdrawal). A fixed bank or exchange fee is a large share of a small transfer, so the bound only decides whether a chip appears unprompted; the by-hand dialog lists every free opposite movement within 30 days, and `decide` takes any shortfall and refuses a gain.
- `converted`, both fiat in different currencies, waits for one real cross-currency pair between own accounts. Crypto never converts: that is a trade.

The tiers, each a pass over every leg still free before the next, so the order of legs never decides:

1. `user`, from `decision`: a `paired` row pairs its two legs, an `external` row takes its leg out. No window, no fit, no search: the row names both legs.
2. `twin`: two free legs in two own accounts at the same instant with the same party and exact opposite amounts pair on their own. The bank printed the same reference on both rows, which is identity, not an amount coincidence: Revolut pocket moves. A leg without words never twins.
3. `route`, from `route` (step 24): a free outgoing leg in an account with a saved route pairs with the nearest free exact counterpart in the route's receiving account within the 4-day window of the next tier, nearest in time, then by key. One direction: a route from A to B pairs nothing sent from B. A short counterpart is left to the next tier.
4. Candidates: every free leg lists the free opposite legs in other own accounts within 4 calendar days (UTC day numbers) that fit, exact before short, then nearest in time, then by key. Both legs are `proposed` and nothing is consumed: a proposal is a chip, never a total.
5. `unmatched`.

Later tiers, with the sources that produce them: `ref` (the same ref in two own accounts, an on-chain send between own addresses) and `peer` (an own address or IBAN printed as the other side), both before `twin`.

Decisions:

- A pair is one row keyed by the sending leg and naming the receiving leg, unique on both keys, with no foreign key to `entry`: it survives a rebuild and dangles harmlessly until its rows return. `decide(key, verdict)` reads both legs (`Unknown movement.`), refuses the same account, a different asset, two legs of one direction or a receiving leg above the sending one, deletes every row keyed by or naming either leg and inserts one, so a verdict replaces whatever it contradicts, from either side. `undecide(key)` deletes the same rows (`Unknown decision.`). Not a transfer writes an `external` row on the acted leg; the other leg of a pair is free again.
- An automatic pair writes nothing; Not a transfer on either leg undoes it.
- A saved route is two account ids, keyed by accounts rather than by the row's words (decided 2026-10-07 over the party-keyed rule first planned): memos vary between months, and two own accounts with exact opposite amounts inside four days is already the strongest signal. `saveRoute(from, to)` refuses one account (`Choose another account.`) and ignores a repeat, `forgetRoute(from, to)` deletes it, `savedRoutes` lists them. Saved from the Transfer to dialog (Always between these accounts, with the pair) or from a route row on Home, forgotten there.
- Not expressible, on purpose: one leg against several, and a transfer to an own account that has no row yet. The virtual leg (`mirrors` in the fold) and the `account` kind of a decision arrive with the first source that produces a rowless own account, exchange exports (26) or a recorded purchase (27). Until then a leg whose other side is not in garner stays `unmatched`, under a transfer category when the user or the AI filed it so.

Fees:

- A printed fee is a `fee` leg under the row's ref. The transfer leg is what crossed, net on a withdrawal and gross on a deposit the institution credited net, and the fee leg what the institution kept, so the legs add up to the balance change and the transfer leg pairs exact.
- A hidden fee is `sent - received` of a short pair: nothing is stored, the sender's side shows and counts it.
- Spending counts a pair only by its fees (Categories, spending).

Cross currency: a conversion a file shows is a `trade` in that account, so both transfer legs are in one currency. One no file shows is the pair itself: nothing is synthesized, the `internal` flow carries `sent` and `received` as they are, the implied rate is received over sent, and the loss against the reference rate is computed in the view.

```ts
export type Amount = { assetId: AssetId; quantity: bigint }
type Flow = { key: MovementKey; time: number } & (
  | { state: 'internal'; from: string; to: string; via: Via; sent: Amount; received: Amount }
  | { state: 'outside'; accountId: string; kind: 'transfer' | 'fee' | 'income'; amount: Amount; assignment: Assignment }
  | { state: 'undecided'; accountId: string; amount: Amount; with: readonly Candidate[] }
)
```

- `flows(movements)` in `src/data/flows.ts`, over the `Movement` rows of any scope: a `trade` leg emits nothing. A paired transfer emits one `internal` flow, from the outgoing leg. A `proposed` leg is `undecided`: no internal edge in the graph, while spending keeps counting the leg until a decision. Everything else is `outside`: external and unmatched transfers, fees, income.
- `routes(flows)` groups the internal flows by (from, to, asset) into `Route` rows, `sent`, `received`, `count` and `last`, most used first, then latest. The (from, to) of a route is what step 24 saves.
- `proposals(movements)` lists every proposed outgoing leg with its first candidate as a `Proposal` (both keys, accounts, time, sent and received, the fit, both memos, and `mutual`, whether the candidate's own first choice is this leg), mutual ones first, then latest. Home shows them as Transfers to confirm (22c): one row per proposal, from and to with their institution glyphs, the day and the amount sent, and a click opens the pair sheet (`-pair.tsx`, 2026-10-12), which pairs the two legs with `decide` and, when its switch is on, saves the route; `arrived` carries the receiving leg's time for the sheet's date line. Not a transfer stays on the account page's row menu.
- Graph v1 (22b) is the Transfers table on Home: the routes of the last 12 months. The outside node is not listed, Spending shows it by category, and proposals stay on the account pages where they are decided. A conversion inside an account is not an edge, and an account with observations alone has no flows. A canvas view of accounts, institutions and transfers comes after it; the library is researched then (`foundation.md`, Later).
- Money flow (22d, 2026-10-13) is the Sankey of one period's flows: `cashflow(rows, range, scope, owners, context)` in `src/data/cashflow.ts`, pure over the `Movement` rows a page already holds, valued like `months()` through `valuation(db, rows)` and `valuer` in `spending.ts` (each leg at its own UTC day; a row without a rate is left out and counted as `unpriced`). A `Range` is whole months, `from` to `to`, stepped by its own length; `period(grain, at)` is the calendar month, quarter or year holding a month, `trailing(3, now)` Home's default, `grainOf` names a range or nothing. A `Scope` is `all` (Home: every account folded into its institution), one institution (its accounts one node) or one account. Nodes carry a typed `Ref`: category, merchant (a counterparty under a transfer-type category, by its identity), account or institution (the inside nodes, or `in:` and `out:` leaves when outside the scope), none, other (with what it folded), kept, balance. Rules, mirroring `months()`: a trade nothing; a paired sending leg draws its node to the peer's node or leaf at `received` and the shortfall plus printed fee to No category; a paired receiving leg only its fee, or, with the peer outside, the peer's leaf into its node; a move between two accounts of one node nothing; an unpaired row under a transfer-type category a merchant or category leaf on the side of its amount legs; expense and income categories net per node and category, the sign choosing the side; open and unsure rows No category, unnetted. Then edges between two inside nodes net per pair, a remaining loop turns its smallest edge into two leaves, every inside node closes with Kept or From balance (on Home a node without outflows stays a sink: a saver), categories and merchants beyond ten per side fold into Other, sub-cent edges drop. Nodes come inside first, then categories, then merchants and accounts, by value, then No category, Other and the leftover.

## Categories, merchants, rules, notes, spending and budgets

Keywords by icon (`src/data/keywords.ts`, 2026-10-12) give the by-hand picker its suggestions: a category is suggested when a word of its icon's list appears in the row's party, the longest word winning. Reworked 2026-10-05 with the AI categorizer (`ai.md`, Categorize), ahead of transfers: categories are their own user state, never a field of `decision`. Merchants joined on 2026-10-06 (step 23h): the party says who, the category what for, the merchant what business it is.

```ts
export type CategoryType = 'expense' | 'income' | 'transfer'
export type Source = 'user' | 'ai'
export type Category = {
  id: string
  name: string
  icon: CategoryIcon
  type: CategoryType
  hint: string
  updatedAt: number
}
type Rule = { party: string; categoryId: string | null; source: Source }
export type Choice = { accountId: string; ref: string; categoryId: string }
export type Note = { accountId: string; ref: string; body: string }
export type Assignment =
  | { state: 'open'; party: string }
  | { state: 'unsure'; party: string }
  | { state: 'ruled'; party: string; categoryId: string; source: Source }
  | { state: 'chosen'; categoryId: string }
export type Merchant = { id: string; name: string; kind: MerchantKind; updatedAt: number }
export type Identity =
  | { state: 'open' }
  | { state: 'none'; source: Source }
  | { state: 'linked'; merchantId: string; source: Source }
export type Month = `${number}-${number}`
export type Budget = { categoryId: string; month: Month; assetId: `fiat:${string}`; quantity: string }
```

- A movement is one row of `movements`: the legs of one ref in one account, summed per asset. It is categorized as a whole, so a fee follows its purchase. A movement with a `trade` leg is a swap, not a purpose: it has no assignment, no Category cell and never reaches the queue.
- A party is `partyOf(memo)`: `plain(memo)` with every character that is not a letter or a digit turned into a space, every word holding two or more digits dropped (references, phone numbers, IBANs, dates), single spaces. `o2` and `1password` stay, `mb way 912345678` becomes `mb way`. `''` is no party: only a choice categorizes such a movement. `plain` (`core/search.ts`, shared with search): NFKD, marks stripped, lower case.
- `assign(party, choice, rules)`, first match wins: the movement's choice (`chosen`), else the rule of its party (`ruled` with its source, or `unsure` for an AI rule without a category), else `open`. Evaluated on read: no apply-to-past, no order column, no locks.
- A rule matches its party by equality, never by containment: one lookup per movement, no overlap order, and an answer for `bolt` never captures `bolt food`. The model does the generalizing across spellings, once per party. Since `rule.party` and `identity.party` are `partyOf` output stored as keys, a change to `partyOf` rekeys both tables in the same change, a user row winning a collision; its tests pin its output on fixed synthetic memos.
- A merchant (table `merchant`, migration 13) is the organisation behind parties: a name unique folded like `partyOf` (case, accents, punctuation and spacing; the table's nocase index is the floor), a `kind` from the append-only list in `src/data/merchants.ts` (38 organisation kinds, supermarket to government; no person, no website, no parent), edited and removed like a category. The link is `identity` (party, nullable merchantId, source), one row per party like `rule`: `linked` names the merchant, `none` says the party is a person, an own account or unknown, `open` is no row. The AI's row is inserted where none exists, the user's replaces it (`identify(party, merchantId | null)`), removing a merchant cascades and reopens its parties, and Remove AI answers drops the AI's rows and the merchants only they used. A merchant is not a location: a chain is many parties behind one merchant, and one company with two businesses (Uber, Uber Eats) is two merchants. Names from the AI are matched folded like `partyOf` before a row is made. Parties and By follow the identity rows, like Remove AI answers; Movements the ledger.
- A user rule replaces any rule of its party. An AI rule is inserted only where the party has none (`on conflict (party) do nothing`, never OR IGNORE, which would swallow a CHECK failure), so the first answer wins and a user rule is never touched. Unsure is an AI rule without a category: not asked again until it is removed.
- Types: `expense` is spent and `income` earned; `transfer` is neither (since step 23e): money between own accounts (pockets, top-ups, card repayments) and Loans (money lent or borrowed, and its repayment). Refunds, and a person paying back their share, take the category of what was paid. A pocket move takes Transfers by rule, which is what lets categories ship before pairing. Pairing stays separate (Transfers and the graph): a decision says which own account a leg went to, a category what it was for.
- One dialog, two scopes: this movement (a choice) or all like this (a user rule for its party, named in the dialog with the number of movements that will follow it, from the root loader's `pending.alike`: those without a choice of their own, plus this one). All like this is the default wherever the movement has a party. Saving all like this also clears this movement's choice, in the same write.
- Seeded by migrations 10 to 12, editable and removable, no groups:

| Name | Type | Icon | Hint |
|---|---|---|---|
| Groceries | expense | ShoppingBasket01 | Supermarkets, bakeries, butchers, markets |
| Eating out | expense | Restaurant01 | Restaurants, cafes, bars, food delivery |
| Housing | expense | Home01 | Rent, mortgage, condo fees, repairs, furniture |
| Utilities | expense | PlugSocket | Electricity, water, gas, internet, phone |
| Transport | expense | Bus01 | Public transport, taxis, ride hailing |
| Car | expense | Car01 | Fuel, charging, parking, tolls, maintenance, repairs, inspection, car tax |
| Travel | expense | AirplaneTakeOff01 | Flights, hotels, stays, car rental abroad |
| Shopping | expense | ShoppingBag01 | Clothes, electronics, home goods, online stores |
| Health | expense | Medicine01 | Pharmacy, doctors, dentist, hospital |
| Personal care | expense | Scissor | Hair, beauty, gym, laundry |
| Entertainment | expense | Ticket01 | Streaming, games, cinema, concerts, events |
| Software | expense | Cloud | Apps, cloud storage, software, AI tools |
| Education | expense | Mortarboard | Courses, books, schools |
| Insurance | expense | Shield01 | Health, home, car, life insurance |
| Taxes | expense | Taxes | Income tax, stamp duty, government fees, and their refunds |
| Fees | expense | Invoice01 | Bank fees, card fees, interest paid |
| Gifts | expense | Gift | Presents and donations |
| Cash | expense | Atm01 | Cash withdrawals |
| Salary | income | Briefcase01 | Pay from an employer: salary, bonuses, holiday and Christmas subsidies, meal allowance |
| Freelance | income | Laptop | Payments from clients for my own work: invoices, recibos verdes, gig platforms |
| Interest | income | PercentCircle | Interest, dividends, staking, earn and crypto rewards |
| Rental income | income | Key01 | Rent received from tenants for property I own or sublet |
| Other income | income | MoneyReceive01 | Gifts, cashback, prizes, sales of my own things, anything else received |
| Transfers | transfer | ArrowDataTransferHorizontal | Moves between my own accounts: savings pockets, top-ups, card repayments |
| Loans | transfer | Agreement01 | Money lent to or borrowed from people, and the repayments |

- Icons are `CategoryIcon` keys, an append-only list in `src/data/categories.ts` mapped to Hugeicons by the `icons` `Record` in `src/routes/-categories.tsx`, so a missing icon fails `tsc` and a new icon needs no migration. It holds 34 icons: those of the 25 seeds (Car uses the car), and spares for the user's own categories: coffee, fuel, phone, pet, baby, people, bank, repeat, tag.
- Notes are the user's words on one movement, shown beside its memo after its kind. They never feed a rule and are never sent to a model.
- `overview` assigns every movement once and counts the movements of each category and each rule, for the Categories page.
- `queue(all, names, categories, merchants)` and `accept(wanted, known, categories, existing, answers)` are the AI's side, pure, specified with the tool in `ai.md` (Categorize).
- Spending is the part of the graph that touches the outside node. `months(db, movements)` gives each month of the movements of a scope Spent (money out under expense categories or none, net of refunds under expense categories), In and Out, in the display currency. A paired movement is internal and counts nothing but its fees: its fee legs and, on the sending side, the shortfall of a short pair, as spent under no category; an unpaired movement under a `transfer` category counts its fee legs the same way and nothing else. Trade movements never count. A proposed leg counts like an open one until a decision, since a proposal is a chip, never a total; the month header counts the proposals. Two predicates in `spending.ts` carry these rules: `internal` (a paired movement, or one under a `transfer` category) and `spends` (not a trade, not internal, an expense category in either sign or no category with money out); `months()`, the Movements table's fold and search's spent and received share them, so search counts as the month headers do (`search.md`).
- Refunds net: a category's amount is the signed sum of its movements. Expense categories and open outgoing movements add to spent, income categories and open incoming movements to earned.
- Each leg is valued at its own day's rate. A day without a rate is counted as unpriced and left out, never valued at 1. Months are UTC, like `dayOf`, which for a bank row is the printed month.
- Budgets: `target(budgets, categoryId, month)` takes the row with the greatest month not after it. No envelope, no rollover column. A budget line is valued in its budget's asset: legs in that asset sum exactly, others convert at their own day's rate. The display currency applies only at render.
- Left out: groups, tags, splits, containment patterns, confidence scores, a rules engine with conditions. Fiat assets only at first, one filter at the call site.
- Writes, one domain function each, shared by dialogs and the MCP tool: `createCategory`, `editCategory`, `removeCategory`, `choose(movement, categoryId)`, `setRule(party, categoryId, from?)` (a user rule; `from` is the movement it was made from), `forget(party)` (removes a rule of either source, so the party is asked again), `clearAi()` (AI rules, the merchants only the AI linked, AI identities), `categorize(answers)` (AI rules, new merchants and AI identities in one write), `createMerchant`, `editMerchant`, `removeMerchant` (its identities cascade), `identify(party, merchantId | null)` (a user identity), `setNote(movement, body)` (empty removes), a movement being a `MovementKey` (accountId, ref), and with later steps `decide`, `undecide`, `setBudget`.

## Lots and taxes

`lots(entries, transfers, rates, rule)` is pure and runs at read time. Step 27.

- A lot is one acquisition: the acquiring leg's key, account, canonical asset, acquisition time, quantity, cost and expenses. It opens from a trade's asset leg (cost from the quote leg, fees of that `ref` as expenses), from `income` (cost per rule), from a paired transfer in (the lot moves with its time and cost intact) or from a swap (per rule).
- A disposal consumes lots in the rule's order within the rule's pool. Two readings of ours, since the law orders disposals only and says nothing on fees in kind: a transfer out takes the oldest lots first, and a `fee` paid in crypto consumes lots too. A fee's value counts as an expense only on a trade's `ref`.
- An `external` transfer out closes its lots as a disposal at the day's market value. An `external` transfer in with no recorded purchase behind it is an `Issue` of its own, `unsourced`, never a silent zero-cost lot. Both are readings to confirm. For an asset that forms lots a leg becomes `external` only by a decision on that leg, never by a rule.
- Cash: one `Rule` field says whether cash in another currency forms lots. While it says no, an all-fiat trade forms no lot, and a non-zero opening, a hole and an unmatched leg are issues only for an asset that forms lots.
- A fee that shares a ref with income: the default for a Kraken reward commission is the printed gross income plus the printed fee leg, with `lots` netting the fee. Open until the real export.
- Values are in the rule's currency: a fiat leg in that currency as-is, another fiat at the ECB reference rate of the local day (our stand-in for the statutory buy and sell rates, previous business day when there is none), crypto at the DefiLlama price of that day only where the rule needs a market value, rounded once per form row.
- Output: `Slice`, one form row per lot and disposal (acquired, realized, quantity, cost, proceeds, expenses, excluded or taxable), the open lots, and `Issue = opening | hole | unmatched | unsourced | unpriced | oversold`, each with the leg or the day it points at. Nothing refuses a running sum below zero any more, so a missing early window shows as `opening` where a balance was printed and as `oversold` where none was. A year with issues is shown as incomplete, never as a number. Accounts outside the ledger are listed as not covered.
- Tax days are calendar days in the rule's zone for entries stored in UTC (exchanges and chains). A bank entry is in statement time, so its tax day is its printed day; how `lots` tells the two apart is settled in step 27.
- `Rule` is one typed record: currency, zone, pool (`account`), order (`fifo`), exclusion after N days, the swap reading, income timing, whether excluded losses count, whether cash forms lots. Portugal is its only value and there is no Settings row until a second rule lands; residence periods and moving between countries come later.
- Record purchase on an account resolves an `unsourced` issue.

## Portugal

Read on the AT portal on 2026-09-28 and re-checked 2026-09-30 (CIRS as amended by Lei 24-D/2022 in force since 2023-01-01, renumbered by Lei 31/2024 and DL 97/2026, DAC8 reporting by Lei 26/2026; the AT leaflet "Criptoativos" of December 2025; PIV 28969 of 2025-10-31). Article numbers moved in 2024 and 2026, so cite the rule, not the number. Confirm with an accountant before filing.

- Category G: gains from the onerous disposal of crypto that is not a security. Taxed at 28% on the year's net balance, or aggregated by option, which also aggregates every other category G income under the same option; losses carry forward five years only under aggregation, and a loss against a counterparty in a listed favourable regime never counts (deferred with the institution column).
- Exclusion: lots held 365 days or more. Gains and losses are both excluded, so a long-held loss never offsets a gain. Excluded disposals are still declared (Anexo G1). The exclusion, the swap deferral and the staking deferral all fail when the counterparty is not resident in the EU, the EEA or a state with a tax treaty or exchange of information; v1 assumes every counterparty qualifies, and the non-qualifying path (Anexo G 18B, income taxed at receipt) arrives with the institution column.
- Crypto for crypto: no taxable event when the exclusion does not apply, and the coins received take the acquisition value of the coins given. The statute carries the value, not the date. PIV 28969 carried the date for one narrow case, an immediate technical hop into a stablecoin before a sale in EUR. `Rule.swap` is `resetExcluded`: date and value carry for lots under 365 days (a reading), and a lot held 365 days or more is an excluded disposal whose received coins start at market value on the swap date (the literal statute). Another reading (`carry` on every swap, or `reset` on every swap) is added as a value only when an accountant asks for it.
- FIFO: the coins sold are the ones acquired first, applied per entity. One exchange login is one garner account with its sub-wallets as parts, and one address is one account, so the pool is the account. Bank products are separate accounts of one entity: that matters only if cash forms lots, and then the pool for cash is the institution.
- Cash: whether foreign currency cash forms lots, so that holding USD or GBP makes FX gains, is a question for an accountant. Until answered `Rule` says no.
- Values: the consideration actually paid or received. Fees necessary and effectively borne for the acquisition and the disposal are deductible. Market value only for income in kind, exchanges for goods, and swaps whose date resets.
- Staking, earn and interest paid in crypto by a qualifying payer are taxed as a gain when the coins received are sold, at zero cost as our reading (the statute taxes the whole later gain, no ruling found); a non-qualifying payer taxes them at receipt at market value, which then becomes the lot's cost. Running a validator or mining is category B, not modelled.
- Forms: Anexo G (taxable disposals), G1 (excluded), J (foreign platforms). Every row is one acquisition date and value against one realization date and value, expenses in their own column, plus the platform's entity and the counterparty's country. v1 exports the slices as CSV; entity and country arrive with the institution column.
- Losing tax residence counts as a disposal at market value. From 2026 platforms report per user totals under DAC8, first report due 2027-05-31. Both are later.

## Export formats

Exchanges researched 2026-09-26, banks for the plan of 2026-10-04. Revolut is settled on two real exports (2026-10-04). The rest is to confirm on real files, two overlapping exports per source.

Revolut, step 16:

- File name `account-statement_<from>_<to>_<language>_<hash>.csv`, language `en-us`. Header `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance`. No BOM, LF line ends, a description with a comma is quoted. Amounts carry 2 decimals.
- A file is laid out in Product sections (Current and Savings). The section order can differ between files, and inside a section rows are in Completed Date order, never decreasing, not in Started Date order. `chain` orients each series, so the layout is not relied on.
- The export range filters on Completed Date, the same cell the stamp and the balance follow, so a ranged file has no break inside.
- PENDING and REVERTED rows have no Completed Date and no Balance: they are void and counted.
- `previous Balance + Amount - Fee = Balance` on every transition, zero breaks.
- A file may open with a non-zero balance in any product.
- A fee is printed as a row of Type Charge with Amount 0.00 and the value in Fee: one `fee` leg under a key whose amount is `0`. No other row has a fee.
- Every Savings row has a mirror row in Current at the same completion second with the opposite amount: exact twins for `pair`.
- In the range both files cover, every row has an identical key in each, none only in one file. The row key joins overlapping exports with zero duplicates.
- Identical rows in the same second occur, so `n` is needed.
- Types the parser knows: Card Payment, Transfer, Card Refund, Charge, Deposit, Rev Payment, Exchange. Any other type is a `transfer` counted in `unknown`.
- From public files: the export follows the app language (fr, es and pt headers were seen, with translated Type, Product and State values), a 2021 generation prints the hour unpadded, and a Portuguese fixture shows an interest row whose Fee is tax withheld.
- Still open: whether the clock is UTC or local wall time (stored as printed either way), the other half of an Exchange (a second currency file), an interest row, whether two pockets under one Product print one running balance or one each, and whether a closed pocket keeps its section in later exports.

Santander Portugal, step 21, settled on two real exports (2026-10-05):

- A true BIFF8 `.xls` (a compound file, not an HTML table), one sheet. Five preamble rows (an export date, titles, no account number), then the header `Operation date, Effective date, Description, Amount( EUR ), Account balance( EUR )` in the English online banking. Dates are `dd-mm-yyyy` text cells, amounts and balances number cells with at most two decimals, every row prints its balance, newest first.
- The operation date is the booking date; the effective (value) date is left out. A second export of an overlapping range joins clean in either order: the shorter one after the longer is nothing new, the longer after the shorter adds only its older rows, no hole.
- Descriptions hold names and references. No pattern masks them; they reach a model only through `categorize` (`ai.md`, Bank text).

ActivoBank, step 21, settled on two real exports (2026-10-12): an `.xlsx` from the site's Movimentos export (the app exports PDF only), a title line with the account number, then Moeda, Tipo, Data de and Data até lines, then the table Data Lanc., Data Valor, Descrição, Valor and Saldo, oldest first, every row with its balance, dates as serials formatted `dd/MM/yyyy`, amounts as numbers; `view` renders it like a BIFF file, dates as `dd-mm-yyyy`. The rows that are taxes or interest (stamp duty, withholding) stay transfers until a kind rule is forced.

Kraken ledgers, step 26:

- `txid,refid,time,type,subtype,aclass,subclass,asset,wallet,amount,fee,balance`. Seven header generations exist: older files lack `subclass` or `wallet`, some carry an `amountusd` column. `txid` is one row, `refid` the event, so both sides of a trade share it. UTC.
- The running balance is per printed asset and wallet, not per asset: `balance = previous + amount - fee`, the fee in the row's asset. On six public files, 27 series keyed that way hold on every transition; keyed by asset alone they break. Wallets seen: `spot / main`, `earn / flexible`, `earn / liquid`.
- Legacy codes XXBT, XETH, ZEUR, ZUSD. Staking and earn suffixes (`.S .M .F .B .P` and more, the list is taken from the real export) are the base coin. Subtype `tradespot` exists.
- Legacy staking legs (`spottostaking`, `stakingfromspot`) share no refid: each is a single-row group. Earn deallocation and migration rows do share one. So internal moves are dropped by a (type, subtype) table, never by netting inside a ref.
- An internal row can be one-sided: `spotfromfutures` has no counter-row, since Kraken Futures keeps its own ledger. Dropped, it leaves entries off the printed balance, and Kraken writes no file observation to show it. What `plan` checks at the end of a series, and what such a row becomes, is settled on the real export.
- Fees paid in fee credits show as `KFEE` and are skipped, rows with a blank `txid` failed and are skipped. Withdrawals carry no destination address, so a Kraken withdrawal to an own wallet is a twin or a decision until on-chain movements exist.
- To confirm: XXBT or BTC in current files, the `wallet` strings, fractional seconds, printed decimals, the reward commission, and how a partial window should read.

Coinbase transaction history, step 26:

- A preamble with the user's name, then `ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes`. Five header generations are known and a 13-column form with sender and recipient address columns is reported, seen only in fixtures. Fiat columns carry currency symbols. UTC.
- A Convert is one row with its destination only in Notes, and an Advanced Trade keeps its quote side there too. Send rows carry the destination address in Notes, which becomes `peer`. Card buys have no fiat deposit row, so the funding rule comes from a real export. The cost is Subtotal plus the fee, or Total, never both.
- Coinbase prints a deposit net of its fee: 2990 credited of 3000 sent. The parser emits the gross transfer plus a `fee` leg wherever the file gives both, so the bank's 3000 pairs as exact; a withdrawal is the net transfer plus the fee leg, so the receiving bank's amount pairs as exact.
- No balance column: no file observation and no check. A missing early window shows only as a sum below zero, a missing middle window not at all, and a typed balance is the check.
- The preamble is kept: `raw` is the whole file, since a rebuild re-detects from it, and no tool returns it.
- To confirm: the header generation of a current export, whether one event can span two ids, and whether ids stay stable across exports and generations. That needs one old and one new export of the same account.

## On-chain movements, later

After imports, transfers and lots work on exchange data.

- Plain RPC cannot list an address's transactions, and PublicNode refuses archive ranges, so keyless `eth_getLogs` history does not exist. Etherscan's free tier dropped Base, OP, BNB and Avalanche in 2025.
- Source: one `explorer` adapter over the Etherscan-compatible account API (`txlist`, `txlistinternal`, `tokentx`, paged by block), keyless through public Blockscout and Routescan instances where they cover a chain, an opt-in key only for the rest. Coverage per chain is checked when building. A block cursor per account and chain makes scans incremental.
- Remote history is not rebuildable like a kept file, so everything a later step needs is stored at fetch time: `peer`, the fee leg, and the block in the cursor.
- EVM entries pair by `ref`: the same transaction in two own addresses.
- Once an address has entries, sync stores an observation whenever the chain balance differs from the fold's closing, not from the last observation, so a balance that disagrees with the ledger shows as a hole.
- Tokens outside the top 1000 that moved through an address get an unpriced asset row, hidden as dust. Rebasing tokens change balance without a movement, which the fold reports as a hole.
- The `identifier` table arrives with the first source that prints a counterparty bank account (an IBAN or an account number). The mask extension (bech32 and base58 forms) arrives before the first tool that returns a `peer`, with this step at the latest.

## AI path, later

What a tool may return and how a model categorizes parties are designed in `ai.md` (Bank text, Categorize). On the ledger side:

- `peer` leaves the app only as an alias. Bech32 and base58 forms join the mask before the first tool that returns a `peer`; base58 is case-sensitive, so the `lower()` CHECK on `alias.address` goes in that migration.
- Unknown files: a mapping step for a file no parser detects, a `Mapping` inferred by the model or filled by hand, stored in `import.mapping`, with the `mapping` state of `ImportFlow`. Then a file parked in garner and the tools `park_import`, `list_imports` (parsed fields only: parser, range, counts), `preview_import` and `apply_import`. A raw CSV dropped straight into a chat app goes to that provider whole, withdrawal addresses and descriptions included; only the parked path keeps the guarantee, and the UI says so.

True from migration 7 on, so none of this needs a re-export:

1. Raw files are kept whole and entries rebuild from them, so any column a classifier later needs is a migration and a rebuild.
2. `memo` is stored verbatim and normalized on read.
3. A category lives on user state (`choice`, `rule`), never on `entry`.
4. A rule does not depend on leg keys.
5. Withheld amounts are legs of their own.

import { type Compilable, type RawBuilder, sql } from 'kysely'
import type { CategoryIcon } from './categories'
import { builder, type Db, type Migration } from './db'
import type { MerchantKind } from './merchants'

export type Address = `0x${string}`
export type Day = `${number}-${number}-${number}`
export type CanonicalId = `coingecko:${string}` | `fiat:${string}`
export type DeploymentId = `eip155:${number}/${'native' | `erc20:${string}`}`
export type AssetId = CanonicalId | DeploymentId

export const isCanonical = (id: string): id is CanonicalId =>
  id.startsWith('coingecko:') || id.startsWith('fiat:')

export const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10) as Day

export const monthOf = (time: number) => dayOf(time).slice(0, 7)

export type Institution = { id: string; name: string; updatedAt: number }

type AccountBase = {
  id: string
  institutionId: string
  name: string
  updatedAt: number
}

export type EvmAccount = AccountBase & { kind: 'evm'; address: Address }
export type ManualAccount = AccountBase & { kind: 'manual'; address: null }
export type Account = EvmAccount | ManualAccount

type AccountRow = AccountBase & { kind: Account['kind']; address: Address | null }

export const accountOf = (row: AccountRow): Account =>
  row.address
    ? { ...row, kind: 'evm', address: row.address }
    : { ...row, kind: 'manual', address: null }

export type Asset = {
  id: AssetId
  canonical: CanonicalId
  symbol: string
  name: string
  decimals: number
}

export type Balance = {
  accountId: string
  assetId: AssetId
  day: Day
  time: number
  quantity: string
}

export type Price = { assetId: CanonicalId; day: Day; usd: number }

type Token = {
  id: AssetId
  coin: string
  symbol: string
  name: string
  rank: number
  seenAt: number
}

type Setting = { key: string; value: string; updatedAt: number }

type Alias = { placeholder: string; address: Address; createdAt: number }

export type Import = { id: string; name: string; raw: string; tickers: string; accounts: string }

export type Kind = 'trade' | 'fee' | 'income' | 'transfer'

export type Entry = {
  accountId: string
  ref: string
  leg: string
  time: number
  kind: Kind
  assetId: AssetId
  quantity: string
  peer: string | null
  memo: string | null
}

export type DecisionRow = {
  accountId: string
  ref: string
  leg: string
  kind: 'external' | 'paired'
  peerAccountId: string | null
  peerRef: string | null
  peerLeg: string | null
}

export type RouteRow = { fromId: string; toId: string }

export const categoryTypes = ['expense', 'income', 'transfer'] as const

export type CategoryType = (typeof categoryTypes)[number]

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

type Choice = { accountId: string; ref: string; categoryId: string }

type Note = { accountId: string; ref: string; body: string }

export type Merchant = { id: string; name: string; kind: MerchantKind; updatedAt: number }

type IdentityRow = { party: string; merchantId: string | null; source: Source }

export type Schema = {
  institution: Institution
  account: AccountRow
  asset: Asset
  balance: Balance
  price: Price
  token: Token
  setting: Setting
  alias: Alias
  import: Import
  entry: Entry
  decision: DecisionRow
  route: RouteRow
  category: Category
  rule: Rule
  choice: Choice
  note: Note
  merchant: Merchant
  identity: IdentityRow
}

export const q = builder<Schema>()

export const scale = 18

export const coin = <Id extends CanonicalId>(id: Id, symbol: string, name = symbol) => ({
  id,
  canonical: id,
  symbol,
  name,
  decimals: scale,
})

export async function exists(
  db: Db,
  table: 'institution' | 'account' | 'asset' | 'category' | 'merchant',
  id: string,
) {
  const rows = await db.read(q.selectFrom(table).select('id').where('id', '=', id))
  if (!rows.length) throw new Error(`Unknown ${table}.`)
}

export const addAssets = (assets: Asset | readonly Asset[]) =>
  q
    .insertInto('asset')
    .values(assets)
    .onConflict((oc) => oc.doNothing())

export const bind = (statement: RawBuilder<unknown>): Compilable => ({
  compile: () => statement.compile(q),
})

export const quote = (rows: readonly Price[]) =>
  bind(sql`insert into price (assetId, day, usd)
    select asset.id, j.value ->> 'day', j.value ->> 'usd'
    from json_each(${JSON.stringify(rows)}) as j
    cross join asset on asset.id = j.value ->> 'assetId'
    where j.value ->> 'usd' >= 0
    on conflict (assetId, day) do update set usd = excluded.usd`)

export const migrations: readonly Migration[] = [
  [
    `create table account (
      id text primary key,
      name text not null,
      kind text not null check (kind in ('evm', 'manual')),
      address text unique check (address = lower(address)),
      syncedAt integer,
      updatedAt integer not null,
      check ((kind = 'evm') = (address is not null))
    ) strict`,
    `create table asset (
      id text primary key,
      parent text references asset (id),
      symbol text not null,
      name text not null,
      decimals integer not null check (decimals >= 0),
      logo text,
      hidden integer not null check (hidden in (0, 1)),
      check (parent is null or (id like 'eip155:%' and parent not like 'eip155:%'))
    ) strict`,
    `create table balance (
      accountId text not null references account (id) on delete cascade,
      assetId text not null references asset (id),
      day text not null check (day is date(day)),
      quantity text not null check (quantity <> '' and quantity not glob '*[^0-9]*'),
      primary key (accountId, assetId, day)
    ) strict, without rowid`,
    `create table price (
      assetId text not null references asset (id),
      day text not null check (day is date(day)),
      usd real not null check (usd >= 0),
      primary key (assetId, day)
    ) strict, without rowid`,
  ],
  [
    `create table token (
      id text primary key,
      coin text not null,
      symbol text not null,
      name text not null,
      seenAt integer not null
    ) strict, without rowid`,
  ],
  [
    `create table wallet (
      id text primary key,
      name text not null,
      updatedAt integer not null
    ) strict`,
    `insert into wallet
      select '00000000-0000-7000-8000-000000000000', 'Main', 0
      where exists (select 1 from account)`,
    `create table grouped (
      id text primary key,
      walletId text not null references wallet (id) on delete cascade,
      name text not null,
      kind text not null check (kind in ('evm', 'manual')),
      address text unique check (address = lower(address)),
      syncedAt integer,
      updatedAt integer not null,
      check ((kind = 'evm') = (address is not null))
    ) strict`,
    `insert into grouped
      select id, '00000000-0000-7000-8000-000000000000', name, kind, address, syncedAt, updatedAt
      from account`,
    'drop table account',
    'alter table grouped rename to account',
  ],
  [
    `create table setting (
      key text primary key,
      value text not null check (json_valid(value)),
      updatedAt integer not null
    ) strict, without rowid`,
  ],
  [
    `create table alias (
      placeholder text primary key,
      address text not null unique check (address = lower(address)),
      createdAt integer not null
    ) strict, without rowid`,
  ],
  ['alter table asset drop column logo', 'alter table asset drop column hidden'],
  [
    'drop table token',
    `create table token (
      id text primary key,
      coin text not null,
      symbol text not null,
      name text not null,
      rank integer not null,
      seenAt integer not null
    ) strict, without rowid`,
  ],
  [
    `create table coin (
      id text primary key,
      canonical text not null references asset (id),
      symbol text not null,
      name text not null,
      decimals integer not null check (decimals >= 0),
      check (canonical not glob 'eip155:*' and (id glob 'eip155:*' or canonical = id))
    ) strict`,
    `insert into coin
      select id, coalesce(parent, id), symbol, name, case when id glob 'fiat:*' then 18 else decimals end
      from asset`,
    'drop table asset',
    'alter table coin rename to asset',
    `create table observed (
      accountId text not null references account (id) on delete cascade,
      assetId text not null references asset (id),
      day text not null check (day is date(day)),
      time integer not null check (time > 0),
      quantity text not null check (
        quantity = '0'
        or (quantity glob '[1-9]*' and quantity not glob '*[^0-9]*')
        or (assetId glob 'fiat:*' and quantity glob '-[1-9]*' and substr(quantity, 2) not glob '*[^0-9]*')
      ),
      primary key (accountId, assetId, day),
      check (day = date(time / 1000, 'unixepoch'))
    ) strict, without rowid`,
    `insert into observed
      select accountId, assetId, day, min((unixepoch(day) + 86400) * 1000 - 1, unixepoch() * 1000),
        case when assetId glob 'fiat:*' then null else quantity end
      from balance`,
    'drop table balance',
    'alter table observed rename to balance',
    'alter table account drop column syncedAt',
    "delete from setting where key = 'mcpToken'",
    `create table import (
      id text primary key,
      name text not null check (name <> ''),
      raw text not null check (raw <> ''),
      tickers text not null check (json_type(tickers) = 'object'),
      accounts text not null check (json_type(accounts) = 'object')
    ) strict`,
    `create table entry (
      accountId text not null references account (id) on delete cascade,
      ref text not null check (ref <> ''),
      leg text not null check (leg <> ''),
      time integer not null check (time > 0),
      kind text not null check (kind in ('trade', 'fee', 'income', 'transfer')),
      assetId text not null references asset (id),
      quantity text not null check (
        (quantity glob '[1-9]*' and quantity not glob '*[^0-9]*')
        or (quantity glob '-[1-9]*' and substr(quantity, 2) not glob '*[^0-9]*')
      ),
      peer text check (peer is null or (peer <> '' and peer = trim(peer))),
      memo text check (memo is null or (memo <> '' and memo = trim(memo))),
      primary key (accountId, ref, leg),
      check (kind <> 'fee' or quantity glob '-*'),
      check (kind <> 'income' or quantity not glob '-*')
    ) strict, without rowid`,
    `create table decision (
      accountId text not null references account (id) on delete cascade,
      ref text not null,
      leg text not null,
      peerId text references account (id) on delete cascade,
      primary key (accountId, ref, leg),
      check (peerId <> accountId)
    ) strict, without rowid`,
  ],
  [
    `delete from price
      where assetId glob 'fiat:*'
        and strftime('%w', day) not in ('0', '6')
        and day < (select max(day) from price as newest where newest.assetId = price.assetId)`,
  ],
  [
    'alter table wallet rename to institution',
    `create table holder (
      id text primary key,
      institutionId text not null references institution (id) on delete cascade,
      name text not null,
      kind text not null check (kind in ('evm', 'manual')),
      address text unique check (address = lower(address)),
      updatedAt integer not null,
      check ((kind = 'evm') = (address is not null))
    ) strict`,
    'insert into holder select id, walletId, name, kind, address, updatedAt from account',
    'drop table account',
    'alter table holder rename to account',
  ],
  [
    `create table category (
      id text primary key,
      name text not null unique collate nocase check (name <> '' and name = trim(name)),
      icon text not null check (icon <> ''),
      type text not null check (type in ('expense', 'income', 'transfer')),
      hint text not null check (hint = trim(hint)),
      updatedAt integer not null
    ) strict`,
    `create table rule (
      party text primary key check (party <> '' and party = lower(trim(party)) and party not glob '*  *'),
      categoryId text references category (id) on delete cascade,
      source text not null check (source in ('user', 'ai')),
      check (categoryId is not null or source = 'ai')
    ) strict, without rowid`,
    `create table choice (
      accountId text not null references account (id) on delete cascade,
      ref text not null check (ref <> ''),
      categoryId text not null references category (id) on delete cascade,
      primary key (accountId, ref)
    ) strict, without rowid`,
    `create table note (
      accountId text not null references account (id) on delete cascade,
      ref text not null check (ref <> ''),
      body text not null check (body <> '' and body = trim(body)),
      primary key (accountId, ref)
    ) strict, without rowid`,
    `insert into category (id, name, icon, type, hint, updatedAt) values
      ('01a1095c-3400-7246-bbf1-f832badb9efa', 'Groceries', 'basket', 'expense', 'Supermarkets, bakeries, butchers, markets', 1791158400000),
      ('01a1095c-3401-74f5-b7af-a2d682a08380', 'Eating out', 'restaurant', 'expense', 'Restaurants, cafes, bars, food delivery', 1791158400000),
      ('01a1095c-3402-7ca5-9a3b-6e110121a9f6', 'Housing', 'home', 'expense', 'Rent, mortgage, condo fees, repairs, furniture', 1791158400000),
      ('01a1095c-3403-773b-8e83-a658d2af7412', 'Utilities', 'plug', 'expense', 'Electricity, water, gas, internet, phone', 1791158400000),
      ('01a1095c-3404-731f-9202-7ee3dc230a97', 'Transport', 'bus', 'expense', 'Public transport, taxis, ride hailing, fuel, parking, tolls', 1791158400000),
      ('01a1095c-3405-7375-9a86-1d549655de2c', 'Travel', 'plane', 'expense', 'Flights, hotels, stays, car rental abroad', 1791158400000),
      ('01a1095c-3406-7ca7-adb0-8a9e90ed7783', 'Shopping', 'bag', 'expense', 'Clothes, electronics, home goods, online stores', 1791158400000),
      ('01a1095c-3407-7032-80dc-37905958bc31', 'Health', 'medicine', 'expense', 'Pharmacy, doctors, dentist, hospital', 1791158400000),
      ('01a1095c-3408-70b0-b707-052f8043ad1e', 'Personal care', 'scissor', 'expense', 'Hair, beauty, gym, laundry', 1791158400000),
      ('01a1095c-3409-7bdc-92fd-7e5eb932a086', 'Entertainment', 'ticket', 'expense', 'Streaming, games, cinema, concerts, events', 1791158400000),
      ('01a1095c-340a-71b5-aed5-1a3a61b6e530', 'Software', 'cloud', 'expense', 'Apps, cloud storage, software, AI tools', 1791158400000),
      ('01a1095c-340b-75e4-a98e-5430fe4a3e93', 'Education', 'cap', 'expense', 'Courses, books, schools', 1791158400000),
      ('01a1095c-340c-77d1-bfc8-b2914c925f71', 'Insurance', 'shield', 'expense', 'Health, home, car, life insurance', 1791158400000),
      ('01a1095c-340d-7e32-a302-f0e02ad996e6', 'Taxes', 'taxes', 'expense', 'Income tax, stamp duty, government fees', 1791158400000),
      ('01a1095c-340e-7534-8631-b92b287bfec0', 'Fees', 'invoice', 'expense', 'Bank fees, card fees, interest paid', 1791158400000),
      ('01a1095c-340f-7b9a-ad1c-2b1fcec1a305', 'Gifts', 'gift', 'expense', 'Presents and donations', 1791158400000),
      ('01a1095c-3410-738f-9bec-ee1b0eb4e461', 'Cash', 'atm', 'expense', 'Cash withdrawals', 1791158400000),
      ('01a1095c-3411-751f-919f-4aac9ff70133', 'Salary', 'briefcase', 'income', 'Pay from an employer or clients', 1791158400000),
      ('01a1095c-3412-7372-98f3-a1de4e5a2fe1', 'Other income', 'receive', 'income', 'Interest, sales, money from people, anything else received', 1791158400000),
      ('01a1095c-3413-711e-a6a2-855cb0c7197b', 'Transfers', 'transfer', 'transfer', 'Moves between my own accounts: savings pockets, top-ups, card repayments', 1791158400000)`,
  ],
  [
    `insert into category (id, name, icon, type, hint, updatedAt) values
      ('01a10e82-9000-704f-82d9-69195abb1930', 'Freelance', 'laptop', 'income', 'Payments from clients for my own work: invoices, recibos verdes, gig platforms', 1791244800000),
      ('01a10e82-9001-714d-b9a2-a8e0e8d31c79', 'Interest', 'percent', 'income', 'Interest, dividends, staking, earn and crypto rewards', 1791244800000),
      ('01a10e82-9002-7f83-870b-d5944529bfc1', 'Rental income', 'key', 'income', 'Rent received from tenants for property I own or sublet', 1791244800000),
      ('01a10e82-9003-7d78-adf1-e9022ea3f243', 'Loans', 'handshake', 'transfer', 'Money lent to or borrowed from people, and the repayments', 1791244800000)
      on conflict do nothing`,
    `update category set hint = 'Pay from an employer: salary, bonuses, holiday and Christmas subsidies, meal allowance', updatedAt = 1791244800000 where id = '01a1095c-3411-751f-919f-4aac9ff70133' and hint = 'Pay from an employer or clients'`,
    `update category set hint = 'Gifts, cashback, prizes, sales of my own things, anything else received', updatedAt = 1791244800000 where id = '01a1095c-3412-7372-98f3-a1de4e5a2fe1' and hint = 'Interest, sales, money from people, anything else received'`,
    `update category set hint = 'Income tax, stamp duty, government fees, and their refunds', updatedAt = 1791244800000 where id = '01a1095c-340d-7e32-a302-f0e02ad996e6' and hint = 'Income tax, stamp duty, government fees'`,
  ],
  [
    `insert into category (id, name, icon, type, hint, updatedAt) values
      ('01a10eb9-7e80-7489-a1e6-54120aeeb269', 'Car', 'car', 'expense', 'Fuel, charging, parking, tolls, maintenance, repairs, inspection, car tax', 1791248400000)
      on conflict do nothing`,
    `update category set hint = 'Public transport, taxis, ride hailing', updatedAt = 1791248400000 where id = '01a1095c-3404-731f-9202-7ee3dc230a97' and hint = 'Public transport, taxis, ride hailing, fuel, parking, tolls'`,
  ],
  [
    `create table merchant (
      id text primary key,
      name text not null unique collate nocase check (name <> '' and name = trim(name)),
      kind text not null check (kind <> ''),
      updatedAt integer not null
    ) strict`,
    `create table identity (
      party text primary key check (party <> '' and party = lower(trim(party)) and party not glob '*  *'),
      merchantId text references merchant (id) on delete cascade,
      source text not null check (source in ('user', 'ai'))
    ) strict, without rowid`,
  ],
  [
    'drop table decision',
    `create table decision (
      accountId text not null references account (id) on delete cascade,
      ref text not null check (ref <> ''),
      leg text not null check (leg <> ''),
      kind text not null check (kind in ('external', 'paired')),
      peerAccountId text references account (id) on delete cascade,
      peerRef text check (peerRef is null or peerRef <> ''),
      peerLeg text check (peerLeg is null or peerLeg <> ''),
      primary key (accountId, ref, leg),
      unique (peerAccountId, peerRef, peerLeg),
      check ((kind = 'paired') = (peerAccountId is not null and peerRef is not null and peerLeg is not null)),
      check (peerAccountId is null or peerAccountId <> accountId)
    ) strict, without rowid`,
  ],
  [
    `create table route (
      fromId text not null references account (id) on delete cascade,
      toId text not null references account (id) on delete cascade,
      primary key (fromId, toId),
      check (fromId <> toId)
    ) strict, without rowid`,
  ],
]

import {
  Add01Icon,
  EthereumIcon,
  FileImportIcon,
  Home03Icon,
  Money02Icon,
  Refresh01Icon,
  Settings01Icon,
  Tag01Icon,
  TransactionHistoryIcon,
  ViewIcon,
  ViewOffSlashIcon,
  Wallet03Icon,
} from '@hugeicons/core-free-icons'
import { useNavigate, useParams } from '@tanstack/react-router'
import type { CategoryRow, MerchantRow, RuleRow } from '../data/categories.ts'
import type { Movement } from '../data/ledger.ts'
import type { AccountView, InstitutionView, Position } from '../data/portfolio.ts'
import type { ManualAccount } from '../data/schema.ts'
import { currencies } from '../data/settings.ts'
import type { LegKey } from '../data/transfers.ts'
import type { Action, Command } from '../ui/command.ts'
import { type SymbolName, symbols } from '../ui/symbols.ts'
import { root, useSettings, useSync } from './-data.ts'
import { glyphOf } from './-institutions.tsx'
import { ask, load, type Prompt } from './-layer.ts'
import { Money } from './-money.tsx'

export const pages = [
  ['/', 'Home', Home03Icon, ['money flow', 'transfers', 'routes', 'confirm']],
  ['/crypto', 'Crypto', EthereumIcon, []],
  ['/fiat', 'Fiat', Money02Icon, []],
  ['/categories', 'Categories', Tag01Icon, ['merchants', 'rules']],
  ['/movements', 'Movements', TransactionHistoryIcon, ['transactions']],
  ['/settings', 'Settings', Settings01Icon, ['currency', 'privacy', 'connect']],
] as const

const scoped =
  ({ id, name }: { id: string; name: string }, group: string) =>
  (key: string, label: string, symbol: SymbolName, run: Prompt | Command['run']): Action => ({
    id: `${key} ${id}`,
    group,
    label: typeof run === 'function' ? label : `${label}…`,
    note: name,
    icon: symbols[symbol],
    symbol,
    run: typeof run === 'function' ? run : () => ask(run),
    ...(key === 'remove' && { tone: 'negative' as const }),
  })

export const importInto = (institutionId?: string, accountId?: string) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.onchange = () => load([...(input.files ?? [])], institutionId, accountId)
  input.click()
}

export const importCommands = (file: { id: string; name: string }) => [
  scoped(file, 'Actions')('remove', 'Remove', 'trash', { kind: 'remove-import', file }),
]

export const institutionCommands = (institution: InstitutionView, group = 'Actions') => {
  const action = scoped(institution, group)
  return [
    action('add-account', 'Add account', 'plus', { kind: 'add-account', institution }),
    action('import', 'Import file…', 'square.and.arrow.down', () => importInto(institution.id)),
    action('rename', 'Rename', 'pencil', { kind: 'rename-institution', institution }),
    action('remove', 'Remove', 'trash', { kind: 'remove-institution', institution }),
  ] as const
}

export const accountCommands = (account: AccountView, group = 'Actions') => {
  const action = scoped(account, group)
  const rename = action('rename', 'Rename', 'pencil', { kind: 'rename-account', account })
  const remove = action('remove', 'Remove', 'trash', { kind: 'remove-account', account })
  return account.kind === 'evm'
    ? [
        rename,
        action('copy', 'Copy address', 'document.on.document', () =>
          navigator.clipboard.writeText(account.address),
        ),
        remove,
      ]
    : [
        action('add-holding', 'Add holding', 'plus', { kind: 'add-holding', account }),
        action('import', 'Import file…', 'square.and.arrow.down', () =>
          importInto(account.institutionId, account.id),
        ),
        rename,
        remove,
      ]
}

export const holdingCommands = (account: ManualAccount, holding: Position) => {
  const action = scoped({ id: `${account.id} ${holding.id}`, name: holding.symbol }, 'Actions')
  return [
    action('edit', 'Edit amount', 'pencil', { kind: 'edit-holding', account, holding }),
    action('remove', 'Remove', 'trash', { kind: 'remove-holding', account, holding }),
  ]
}

type Scoped = ReturnType<typeof scoped>

const transferCommands = (
  row: Extract<Movement, { kind: 'transfer' }>,
  action: Scoped,
  title: string,
) => {
  const { key, transfer } = row
  const way = row.quantity < 0n ? 'Transfer to' : 'Transfer from'
  const to = (label: string, initial?: LegKey) =>
    action('transfer', label, 'arrow.left.arrow.right', {
      kind: 'transfer',
      movement: row,
      title,
      initial,
    })
  const not = action('external', 'Not a transfer', 'xmark', {
    kind: 'decide',
    key,
    title,
    action: 'Not a transfer',
  })
  const undo = (label: 'Unpair' | 'Undo') =>
    action('undo', label, 'arrow.uturn.backward', { kind: 'decide', key, title, action: label })
  switch (transfer.state) {
    case 'unmatched':
      return [to(way), not]
    case 'proposed':
      return [to('Confirm transfer', transfer.with[0]?.with), not]
    case 'paired':
      return transfer.via === 'user' ? [undo('Unpair')] : [not]
    case 'external':
      return [to(way), undo('Undo')]
  }
}

export const movementCommands = (row: Movement) => {
  const { accountId, ref, memo, note } = row
  const action = scoped({ id: `${accountId} ${ref}`, name: memo ?? '' }, 'Actions')
  const movement = { accountId, ref }
  const title = memo ?? 'movement'
  return [
    ...(row.kind === 'transfer' ? transferCommands(row, action, title) : []),
    ...(row.kind === 'trade'
      ? []
      : [
          action('categorize', 'Categorize', 'tag', {
            kind: 'categorize',
            movement: row,
            title,
            party: row.party,
            chosen: row.assignment.state === 'chosen',
          }),
          ...(row.party
            ? [
                action(
                  'merchant',
                  row.identity.state === 'linked' ? 'Change merchant' : 'Set merchant',
                  'storefront',
                  { kind: 'identify', party: row.party, title, identity: row.identity },
                ),
              ]
            : []),
        ]),
    action('note', note ? 'Edit note' : 'Add note', 'text.pad.header', {
      kind: 'note',
      movement,
      title,
      note,
    }),
  ]
}

export const categoryCommands = (category: CategoryRow) => {
  const action = scoped(category, 'Actions')
  return [
    action('edit', 'Edit', 'pencil', { kind: 'edit-category', category }),
    action('remove', 'Remove', 'trash', { kind: 'remove-category', category }),
  ]
}

export const merchantCommands = (merchant: MerchantRow) => {
  const action = scoped(merchant, 'Actions')
  return [
    action('edit', 'Edit', 'pencil', { kind: 'edit-merchant', merchant }),
    action('remove', 'Remove', 'trash', { kind: 'remove-merchant', merchant }),
  ]
}

export const ruleCommands = (rule: RuleRow) => {
  const action = scoped({ id: rule.party, name: rule.party }, 'Actions')
  return [
    action('edit', 'Edit', 'pencil', { kind: 'change-rule', rule }),
    action('remove', 'Remove', 'trash', { kind: 'remove-rule', rule }),
  ]
}

export const routeCommands = (
  { from, to, saved }: { from: string; to: string; saved: boolean },
  note: string,
  run: () => Promise<void>,
) => [
  scoped({ id: `${from} ${to}`, name: note }, 'Actions')(
    'route',
    saved ? 'Forget route' : 'Save route',
    saved ? 'bookmark.slash' : 'bookmark',
    run,
  ),
]

export function useCommands(): Command[] {
  const { institutions, holdings, currency, privacy } = root.useLoaderData()
  const { institutionId, accountId } = useParams({ strict: false })
  const navigate = useNavigate()
  const sync = useSync()
  const set = useSettings()
  const value = (usd: number | null) => <Money value={usd} format="compact" />
  const accounts = institutions.flatMap((institution) => institution.accounts)
  const here = ({ id, name }: { id: string; name: string }) =>
    id === institutionId || id === accountId ? name : undefined

  const scoped = [
    ...institutions.flatMap((institution) => institutionCommands(institution, here(institution))),
    ...accounts.flatMap((account) => accountCommands(account, here(account))),
  ]

  return [
    ...scoped.filter(({ group }) => group !== 'Actions'),
    ...pages.map(([to, label, icon, keywords]) => ({
      id: to,
      group: 'Go to',
      label,
      keywords,
      icon,
      run: () => navigate({ to }),
    })),
    {
      id: 'add-institution',
      group: 'Actions',
      label: 'Add institution…',
      icon: Add01Icon,
      run: () => ask({ kind: 'add-institution' }),
    },
    {
      id: 'import',
      group: 'Actions',
      label: 'Import file…',
      keywords: ['bank', 'statement', 'csv'],
      icon: FileImportIcon,
      run: () => importInto(),
    },
    {
      id: 'sync',
      group: 'Actions',
      label: 'Sync now',
      icon: Refresh01Icon,
      run: sync,
    },
    {
      id: 'privacy',
      group: 'Actions',
      label: privacy ? 'Show balances' : 'Hide balances',
      keywords: ['privacy mode'],
      icon: privacy ? ViewIcon : ViewOffSlashIcon,
      run: () => set.privacy(!privacy),
    },
    ...currencies
      .filter((next) => next !== currency)
      .map((next) => ({
        id: `currency ${next}`,
        group: 'Actions',
        label: `Show values in ${next}`,
        keywords: ['currency'],
        icon: Money02Icon,
        run: () => set.currency(next),
      })),
    ...scoped.filter(({ group }) => group === 'Actions'),
    ...institutions.map(({ id, name, accounts, value: usd }) => ({
      id,
      group: 'Institutions',
      label: name,
      icon: glyphOf({ name, accounts }),
      aside: value(usd),
      run: () => navigate({ to: '/institutions/$institutionId', params: { institutionId: id } }),
    })),
    ...institutions.flatMap((institution) =>
      institution.accounts.map(({ id, name, address, value: usd }) => ({
        id,
        group: 'Accounts',
        label: name,
        note: institution.name,
        keywords: address ? [address] : [],
        icon: Wallet03Icon,
        aside: value(usd),
        run: () => navigate({ to: '/accounts/$accountId', params: { accountId: id } }),
      })),
    ),
    ...holdings.map(({ id, symbol, name, value: usd }) => ({
      id,
      group: 'Assets',
      label: symbol,
      note: name,
      icon: { token: id, symbol },
      aside: value(usd),
      run: () => navigate({ to: '/assets/$assetId', params: { assetId: id } }),
    })),
  ]
}

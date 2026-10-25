import { Autocomplete } from '@base-ui/react/autocomplete'
import { Search01Icon } from '@hugeicons/core-free-icons'
import { useNavigate, useParams, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import { date, day, local, plural, quantity } from '../core/format'
import { type Group, type Searchable, search } from '../core/search'
import {
  createEvmAccount,
  createInstitution,
  createManualAccount,
  remove,
  rename,
  setHolding,
  type Table,
} from '../data/accounts'
import {
  type Assignable,
  type CategoryIcon,
  type CategoryInput,
  type CategoryRow,
  choose,
  clearAi,
  createCategory,
  editCategory,
  forget,
  type MerchantRow,
  removeCategory,
  setNote,
  setRule,
} from '../data/categories'
import { removeImport } from '../data/imports'
import { keywords, suggest } from '../data/keywords'
import { type Identity, type Movement, movements } from '../data/ledger'
import {
  createMerchant,
  editMerchant,
  identify,
  merchantKinds,
  removeMerchant,
} from '../data/merchants'
import type { Position } from '../data/portfolio'
import { type Category, type Institution, isCanonical } from '../data/schema'
import { listed } from '../data/tokens'
import { decide, type LegKey, legKey, saveRoute, undecide } from '../data/transfers'
import { AmountInput } from '../ui/amount'
import { Choice } from '../ui/choice'
import { Combobox, type Option } from '../ui/combobox'
import { Dialog as Sheet } from '../ui/dialog'
import { Field } from '../ui/field'
import { FormDialog, NameDialog } from '../ui/form-dialog'
import { Icon } from '../ui/icon'
import { IconGrid } from '../ui/icon-grid'
import { Input } from '../ui/input'
import { Segmented } from '../ui/segmented'
import { Switch } from '../ui/switch'
import { Tile } from '../ui/tile'
import { hues, icons, kindLabel, typeGroups, typeLabels } from './-categories'
import { root, useSync } from './-data'
import { Import } from './-import-dialog'
import { close, type ManualView, type Prompt, useLayer } from './-layer'
import { sum } from './-money'
import { PairSheet } from './-pair'

type Named = { id: string; name: string }
type Dialog = { open: boolean; onClose: () => void }

export function Prompts() {
  const layer = useLayer()
  const [prompt, setPrompt] = useState<Prompt>()
  if (layer.kind === 'prompt' && layer.prompt !== prompt) setPrompt(layer.prompt)
  const { db } = root.useRouteContext()
  const { holdings } = root.useLoaderData()
  const { institutionId, accountId, assetId, merchantId, categoryId } = useParams({ strict: false })
  const leaving = (shown: boolean) => (shown ? () => navigate({ to: '/categories' }) : undefined)
  const router = useRouter()
  const navigate = useNavigate()
  const sync = useSync()
  if (!prompt) return null

  const dialog: Dialog = { open: layer.kind === 'prompt', onClose: () => close('prompt') }
  const refresh = () => router.invalidate()
  const saved = async () => {
    await refresh()
    sync()
  }
  const toInstitution = (institutionId: string) =>
    navigate({ to: '/institutions/$institutionId', params: { institutionId } })
  const toAccount = (accountId: string) =>
    navigate({ to: '/accounts/$accountId', params: { accountId } })
  const onlyHolder = (owns: (position: Position) => boolean) =>
    holdings.find(({ id }) => id === assetId)?.positions.every(owns) ?? false

  const renameDialog = (table: Table, { id, name }: Named) => (
    <NameDialog
      {...dialog}
      key={id}
      title={`Rename ${table}`}
      action="Rename"
      placeholder="Ledger"
      initial={name}
      onSubmit={async (next) => {
        await rename(db, table, id, next)
        await refresh()
      }}
    />
  )

  const confirm = (
    key: string,
    title: string,
    action: string,
    body: string,
    run: () => Promise<void>,
    leave?: () => Promise<unknown>,
  ) => (
    <FormDialog
      {...dialog}
      key={key}
      title={title}
      action={action}
      onSubmit={async () => {
        await run()
        if (leave) await leave()
        await refresh()
      }}
    >
      {(error) => (
        <>
          <p className="text-dim">{body}</p>
          {error && <p className="text-caption text-negative">{error}</p>}
        </>
      )}
    </FormDialog>
  )
  const removeDialog = (
    { id, name }: Named,
    body: string,
    run: () => Promise<void>,
    leave?: () => Promise<unknown>,
  ) => confirm(id, `Remove ${name}?`, 'Remove', body, run, leave)

  switch (prompt.kind) {
    case 'add-institution':
      return (
        <NameDialog
          {...dialog}
          title="Add institution"
          action="Add institution"
          placeholder="Ledger"
          onSubmit={async (name) => {
            const { id } = await createInstitution(db, name)
            await refresh()
            await toInstitution(id)
          }}
        />
      )
    case 'rename-institution':
      return renameDialog('institution', prompt.institution)
    case 'remove-institution': {
      const { id, accounts } = prompt.institution
      const shown =
        institutionId === id ||
        accounts.some((account) => account.id === accountId) ||
        onlyHolder((position) => position.institutionId === id)
      return removeDialog(
        prompt.institution,
        'Its accounts and their balance history are deleted and cannot be rebuilt.',
        () => remove(db, 'institution', id),
        shown ? () => navigate({ to: '/crypto' }) : undefined,
      )
    }
    case 'add-account':
      return (
        <AddAccount
          {...dialog}
          institution={prompt.institution}
          onSaved={saved}
          onManual={toAccount}
        />
      )
    case 'add-holding':
      return <AddHolding {...dialog} account={prompt.account} onSaved={saved} />
    case 'edit-holding':
      return (
        <FormDialog
          {...dialog}
          key={prompt.holding.id}
          title={`Edit ${prompt.holding.symbol}`}
          action="Save"
          onSubmit={async (form) => {
            await setHolding(db, prompt.account.id, prompt.holding.id, String(form.get('amount')))
            await saved()
          }}
        >
          {(error) => (
            <AmountField
              error={error}
              symbol={prompt.holding.symbol}
              initial={formatUnits(prompt.holding.quantity, prompt.holding.decimals)}
            />
          )}
        </FormDialog>
      )
    case 'remove-holding':
      return removeDialog(
        { id: prompt.holding.id, name: `${prompt.holding.symbol} from ${prompt.account.name}` },
        'Its amount becomes zero. Earlier amounts stay in the history.',
        () => setHolding(db, prompt.account.id, prompt.holding.id, '0'),
      )
    case 'import': {
      const file = prompt.files[prompt.at]
      return (
        file && (
          <Import
            {...dialog}
            key={`${prompt.key} ${prompt.at}`}
            title={
              prompt.files.length > 1
                ? `Import ${prompt.at + 1} of ${prompt.files.length}`
                : 'Import'
            }
            file={file}
            institutionId={prompt.institutionId}
            accountId={prompt.accountId}
            onDone={async (id) => {
              await saved()
              await (prompt.accountId && id === prompt.institutionId
                ? toAccount(prompt.accountId)
                : toInstitution(id))
            }}
          />
        )
      )
    }
    case 'remove-import':
      return removeDialog(
        prompt.file,
        'Its rows and the balances it printed are deleted. Other files of this institution stay.',
        () => removeImport(db, prompt.file.id),
      )
    case 'categorize':
      return (
        <Categorize
          {...dialog}
          key={`${prompt.movement.accountId} ${prompt.movement.ref}`}
          movement={prompt.movement}
          title={prompt.title}
          party={prompt.party}
          chosen={prompt.chosen}
          onSaved={refresh}
        />
      )
    case 'note':
      return (
        <FormDialog
          {...dialog}
          key={`${prompt.movement.accountId} ${prompt.movement.ref}`}
          title={`Note on ${prompt.title}`}
          action="Save"
          onSubmit={async (form) => {
            await setNote(db, prompt.movement, String(form.get('note')))
            await refresh()
          }}
        >
          {(error) => (
            <Field label="Note" error={error}>
              <Input
                name="note"
                defaultValue={prompt.note ?? ''}
                placeholder="What it was for"
                autoComplete="off"
              />
            </Field>
          )}
        </FormDialog>
      )
    case 'add-category':
      return (
        <FormDialog
          {...dialog}
          title="Add category"
          action="Add category"
          onSubmit={async (form) => {
            await createCategory(db, fields(form))
            await refresh()
          }}
        >
          {(error) => <CategoryFields error={error} />}
        </FormDialog>
      )
    case 'edit-category':
      return (
        <FormDialog
          {...dialog}
          key={prompt.category.id}
          title={`Edit ${prompt.category.name}`}
          action="Save"
          onSubmit={async (form) => {
            await editCategory(db, prompt.category.id, fields(form))
            await refresh()
          }}
        >
          {(error) => <CategoryFields error={error} category={prompt.category} />}
        </FormDialog>
      )
    case 'remove-category': {
      const { id, movements, rules } = prompt.category
      return removeDialog(
        prompt.category,
        movements || rules
          ? `${[movements && plural(movements, 'movement'), rules && plural(rules, 'rule')].filter(Boolean).join(' and ')} lose this category.`
          : 'Nothing uses it yet.',
        () => removeCategory(db, id),
        leaving(categoryId === id),
      )
    }
    case 'change-rule':
      return (
        <FormDialog
          {...dialog}
          key={prompt.rule.party}
          title={`Categorize all like "${prompt.rule.party}"`}
          action="Save"
          onSubmit={async (form) => {
            await setRule(db, prompt.rule.party, String(form.get('category')))
            await refresh()
          }}
        >
          {(error) => <CategoryPick error={error} />}
        </FormDialog>
      )
    case 'remove-rule':
      return removeDialog(
        { id: prompt.rule.party, name: `the rule for "${prompt.rule.party}"` },
        prompt.rule.categoryId === null
          ? `The AI is asked about ${plural(prompt.rule.movements, 'movement')} again.`
          : `This leaves ${plural(prompt.rule.movements, 'movement')} without a category.`,
        () => forget(db, prompt.rule.party),
      )
    case 'identify':
      return (
        <FormDialog
          {...dialog}
          key={prompt.party}
          title={`Merchant of ${prompt.title}`}
          action="Save"
          onSubmit={async (form) => {
            const picked = String(form.get('merchant'))
            await identify(db, prompt.party, picked === 'none' ? null : picked)
            await refresh()
          }}
        >
          {(error) => <MerchantPick error={error} identity={prompt.identity} />}
        </FormDialog>
      )
    case 'add-merchant':
      return <MerchantDialog {...dialog} onSaved={refresh} />
    case 'edit-merchant':
      return (
        <MerchantDialog
          {...dialog}
          key={prompt.merchant.id}
          merchant={prompt.merchant}
          onSaved={refresh}
        />
      )
    case 'remove-merchant': {
      const { id, parties, movements } = prompt.merchant
      return removeDialog(
        prompt.merchant,
        parties
          ? `${plural(movements, 'movement')} lose it and the AI is asked about ${plural(parties, 'party', 'parties')} again.`
          : 'Nothing uses it yet.',
        () => removeMerchant(db, id),
        leaving(merchantId === id),
      )
    }
    case 'transfer':
      return (
        <TransferDialog
          {...dialog}
          key={legKey(prompt.movement.key)}
          own={prompt.movement}
          title={prompt.title}
          initial={prompt.initial}
          onSaved={refresh}
        />
      )
    case 'pair':
      return (
        <PairSheet
          {...dialog}
          key={legKey(prompt.proposal.key)}
          proposal={prompt.proposal}
          onSaved={refresh}
        />
      )
    case 'decide': {
      const external = prompt.action === 'Not a transfer'
      return confirm(
        legKey(prompt.key),
        `${prompt.action}: ${prompt.title}`,
        prompt.action,
        external
          ? 'It counts as money to or from outside and is never proposed again.'
          : 'The movement is open again and may be proposed.',
        () => (external ? decide(db, prompt.key, { state: 'external' }) : undecide(db, prompt.key)),
      )
    }
    case 'clear-ai':
      return removeDialog(
        { id: 'ai', name: 'AI answers' },
        `This removes ${plural(prompt.rules, 'AI rule')} and ${plural(prompt.merchants, 'AI merchant')}. The AI is asked about their movements again.`,
        () => clearAi(db),
      )
    case 'rename-account':
      return renameDialog('account', prompt.account)
    case 'remove-account':
      return removeDialog(
        prompt.account,
        'Its balance history is deleted and cannot be rebuilt.',
        () => remove(db, 'account', prompt.account.id),
        accountId === prompt.account.id
          ? () => toInstitution(prompt.account.institutionId)
          : onlyHolder((position) => position.accountId === prompt.account.id)
            ? () => navigate({ to: '/crypto' })
            : undefined,
      )
  }
}

type CategorizeProps = Dialog & {
  movement: Assignable
  title: string
  party: string
  chosen: boolean
  onSaved: () => Promise<void>
}

type Known = Pick<Category, 'id' | 'name' | 'icon'>
type Pickable = Searchable & { id: string; icon: CategoryIcon }

function Categorize({ movement, title, party, chosen, onSaved, open, onClose }: CategorizeProps) {
  const { db } = root.useRouteContext()
  const { categories, alike } = root.useLoaderData()
  const count = party ? (alike.get(party) ?? 0) + (chosen ? 1 : 0) : 0
  const [scope, setScope] = useState<'all' | 'one'>(count > 0 ? 'all' : 'one')
  const [query, setQuery] = useState('')
  const [fault, setFault] = useState<string>()
  const pickOf = (category: Known, group: string, note: string): Pickable => ({
    id: category.id,
    group,
    label: category.name,
    note,
    keywords: keywords[category.icon],
    icon: category.icon,
  })
  const every = categories.map((category) =>
    pickOf(category, typeGroups[category.type], category.hint),
  )
  const suggested = party
    ? suggest(party, categories).map(({ category, why }) => pickOf(category, 'Suggested', why))
    : []
  const groups = query
    ? search(every, query)
    : [
        ...(suggested.length ? [{ label: 'Suggested', items: suggested }] : []),
        ...search(every, ''),
      ]
  const save = async (pick: Pickable) => {
    setFault(undefined)
    try {
      await (scope === 'all' && party
        ? setRule(db, party, pick.id, movement)
        : choose(db, movement, pick.id))
      await onSaved()
      onClose()
    } catch (error) {
      setFault(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <Autocomplete.Root
      inline
      open
      items={groups}
      filter={null}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={({ label }: Pickable) => label}
      autoHighlight="always"
      keepHighlight
    >
      <Sheet
        title="Categorize"
        subtitle={
          <>
            <span className="truncate">{title}</span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">{day(movement.time)}</span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">{sum(movement.assetId, movement.quantity)}</span>
          </>
        }
        head={
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-dim">
              <Icon icon={Search01Icon} />
            </span>
            <Autocomplete.Input
              placeholder="Search categories"
              autoCorrect="off"
              spellCheck={false}
              className="h-10 w-full rounded-glass border border-line bg-surface pr-3 pl-9 text-nav outline-none transition placeholder:text-dim focus:border-dim"
            />
          </div>
        }
        foot={
          <>
            {party ? (
              <Segmented
                label="Apply to"
                value={scope}
                options={[
                  { value: 'all', label: `All ${quantity(count)} like this` },
                  { value: 'one', label: 'This one' },
                ]}
                onChange={setScope}
              />
            ) : (
              <span />
            )}
            {fault && <span className="text-caption text-negative">{fault}</span>}
          </>
        }
        open={open}
        onClose={onClose}
      >
        <Autocomplete.List className="-mx-2 flex flex-col gap-1 empty:hidden">
          {({ label, items }: Group<Pickable>) => (
            <Autocomplete.Group key={label} items={items} className="flex flex-col">
              <Autocomplete.GroupLabel className="flex h-6 items-center px-2 text-caption text-dim">
                {label}
              </Autocomplete.GroupLabel>
              <Autocomplete.Collection>
                {(pick: Pickable) => (
                  <Autocomplete.Item
                    key={`${pick.group} ${pick.id}`}
                    value={pick}
                    onClick={() => save(pick)}
                    className="flex h-8 select-none items-center gap-2.5 rounded-control px-2 outline-none data-highlighted:bg-fill"
                  >
                    <Tile hue={hues[pick.icon]} icon={icons[pick.icon]} size="sm" />
                    <span className="shrink-0 font-medium">{pick.label}</span>
                    <span className="truncate text-dim">{pick.note}</span>
                  </Autocomplete.Item>
                )}
              </Autocomplete.Collection>
            </Autocomplete.Group>
          )}
        </Autocomplete.List>
        <Autocomplete.Empty className="py-6 text-dim empty:hidden">
          Nothing found.
        </Autocomplete.Empty>
      </Sheet>
    </Autocomplete.Root>
  )
}

function CategoryPick({ error }: { error: string | undefined }) {
  const { categories } = root.useLoaderData()
  return (
    <Field label="Category" error={error}>
      <Combobox
        name="category"
        options={categories.map(({ id, name, icon, hint }) => ({
          value: id,
          label: name,
          note: hint,
          icon: icons[icon],
        }))}
        placeholder="Search categories"
      />
    </Field>
  )
}

function MerchantPick({ error, identity }: { error: string | undefined; identity: Identity }) {
  const { merchants } = root.useLoaderData()
  return (
    <Field label="Merchant" error={error}>
      <Combobox
        name="merchant"
        initial={
          identity.state === 'linked'
            ? identity.merchantId
            : identity.state === 'none'
              ? 'none'
              : undefined
        }
        options={[
          { value: 'none', label: 'No merchant', note: 'A person or your own account' },
          ...merchants.map(({ id, name, kind }) => ({
            value: id,
            label: name,
            note: kindLabel(kind),
          })),
        ]}
        placeholder="Search merchants"
      />
    </Field>
  )
}

type TransferDialogProps = Dialog & {
  own: Extract<Movement, { kind: 'transfer' }>
  title: string
  initial: LegKey | undefined
  onSaved: () => Promise<void>
}

const days30 = 30 * 86_400_000

function TransferDialog({ own, title, initial, onSaved, open, onClose }: TransferDialogProps) {
  const { db } = root.useRouteContext()
  const [always, setAlways] = useState(false)
  const { accounts } = root.useLoaderData()
  const [rows, setRows] = useState<readonly Movement[]>([])
  useEffect(() => {
    if (!open) return
    setAlways(false)
    movements(db, { all: true }).then(setRows)
  }, [db, open])
  const free = rows.flatMap((row) =>
    row.kind === 'transfer' &&
    row.accountId !== own.accountId &&
    row.assetId === own.assetId &&
    row.quantity < 0n !== own.quantity < 0n &&
    Math.abs(row.time - own.time) <= days30 &&
    row.transfer.state !== 'paired' &&
    row.transfer.state !== 'external'
      ? [row]
      : [],
  )
  const byValue = new Map(free.map((row) => [legKey(row.key), row.key]))

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`Transfer ${own.quantity < 0n ? 'to' : 'from'}: ${title}`}
      action="Pair"
      onSubmit={async (form) => {
        const counterpart = byValue.get(String(form.get('counterpart')))
        if (!counterpart) throw new Error('Choose a movement.')
        await decide(db, own.key, { state: 'paired', with: counterpart })
        if (always) {
          const [from, to] =
            own.quantity < 0n
              ? [own.accountId, counterpart.accountId]
              : [counterpart.accountId, own.accountId]
          await saveRoute(db, from, to)
        }
        await onSaved()
      }}
    >
      {(error) => (
        <>
          <Field label="Movement in another account" error={error}>
            <Combobox
              name="counterpart"
              initial={initial && legKey(initial)}
              options={free.map((row) => ({
                value: legKey(row.key),
                label: `${accounts.get(row.accountId)?.name ?? ''}: ${row.memo ?? 'transfer'}`,
                note: date(row.time),
                aside: sum(row.assetId, row.quantity),
              }))}
              placeholder="Search by account, words or date"
            />
          </Field>
          <div className="flex items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="font-medium">Always between these accounts</span>
              <span className="text-dim">Exact amounts pair on their own from now on.</span>
            </span>
            <Switch label="Always between these accounts" checked={always} onChange={setAlways} />
          </div>
        </>
      )}
    </FormDialog>
  )
}

type MerchantDialogProps = Dialog & { merchant?: MerchantRow; onSaved: () => Promise<void> }

function MerchantDialog({ merchant, onSaved, ...dialog }: MerchantDialogProps) {
  const { db } = root.useRouteContext()
  const [fault, setFault] = useState<'name' | 'kind'>('name')
  return (
    <FormDialog
      {...dialog}
      title={merchant ? `Edit ${merchant.name}` : 'Add merchant'}
      action={merchant ? 'Save' : 'Add merchant'}
      onSubmit={async (form) => {
        const input = { name: String(form.get('name')), kind: String(form.get('kind')) }
        setFault(input.name.trim() && !input.kind ? 'kind' : 'name')
        await (merchant ? editMerchant(db, merchant.id, input) : createMerchant(db, input))
        await onSaved()
      }}
    >
      {(error) => (
        <>
          <Field label="Name" error={fault === 'name' ? error : undefined}>
            <Input
              name="name"
              defaultValue={merchant?.name}
              placeholder="Continente"
              autoComplete="off"
            />
          </Field>
          <Field label="Kind" error={fault === 'kind' ? error : undefined}>
            <Combobox
              name="kind"
              initial={merchant?.kind}
              options={merchantKinds.map((kind) => ({
                value: kind,
                label: kindLabel(kind),
                note: '',
              }))}
              placeholder="Search kinds"
            />
          </Field>
        </>
      )}
    </FormDialog>
  )
}

const fields = (form: FormData): CategoryInput => ({
  name: String(form.get('name')),
  icon: String(form.get('icon')),
  type: String(form.get('type')),
  hint: String(form.get('hint')),
})

function CategoryFields({
  error,
  category,
}: {
  error: string | undefined
  category?: CategoryRow
}) {
  return (
    <>
      <Field label="Name" error={error}>
        <Input
          name="name"
          defaultValue={category?.name}
          placeholder="Groceries"
          autoComplete="off"
        />
      </Field>
      <Choice
        label="Type"
        name="type"
        initial={category?.type}
        options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))}
      />
      <Field label="Hint">
        <Input
          name="hint"
          defaultValue={category?.hint}
          placeholder="What goes in, for you and the AI"
          autoComplete="off"
        />
      </Field>
      <IconGrid name="icon" label="Icon" icons={icons} initial={category?.icon ?? 'tag'} />
    </>
  )
}

type AmountProps = { error: string | undefined; symbol: string | undefined; initial?: string }

function AmountField({ error, symbol, initial }: AmountProps) {
  return (
    <Field label="Amount held" error={error}>
      <AmountInput name="amount" initial={initial} suffix={symbol} placeholder="0" />
    </Field>
  )
}

type AddAccountProps = Dialog & {
  institution: Institution
  onSaved: () => Promise<void>
  onManual: (accountId: string) => Promise<unknown>
}

function AddAccount({ institution, onSaved, onManual, ...dialog }: AddAccountProps) {
  const { db } = root.useRouteContext()
  const [manual, setManual] = useState(false)

  return (
    <FormDialog
      {...dialog}
      title="Add account"
      action="Add account"
      onSubmit={async (form) => {
        const address = String(form.get('address'))
        const name = String(form.get('name'))
        const typed = !address.trim()
        setManual(typed)
        const { id } = typed
          ? await createManualAccount(db, institution.id, name)
          : await createEvmAccount(db, institution.id, address, name)
        await onSaved()
        if (typed) await onManual(id)
      }}
    >
      {(error) => (
        <>
          <Field label="Address" error={manual ? undefined : error}>
            <Input
              name="address"
              placeholder="0x…, or empty for a manual account"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Name" error={manual ? error : undefined}>
            <Input name="name" placeholder="Optional with an address" autoComplete="off" />
          </Field>
        </>
      )}
    </FormDialog>
  )
}

type AddHoldingProps = Dialog & { account: ManualView; onSaved: () => Promise<void> }

function AddHolding({ account, onSaved, open, onClose }: AddHoldingProps) {
  const { db } = root.useRouteContext()
  const [options, setOptions] = useState<Option[]>([])
  const [fault, setFault] = useState<'asset' | 'amount'>('amount')
  const [symbol, setSymbol] = useState<string>()
  const today = local(Date.now())

  useEffect(() => {
    if (!open) return
    setSymbol(undefined)
    db.read(listed).then((rows) =>
      setOptions(
        rows.map(({ id, symbol, name }) => ({
          value: id,
          label: symbol.toUpperCase(),
          note: name,
        })),
      ),
    )
  }, [db, open])
  const available = options.filter(({ value }) => !account.positions.some(({ id }) => id === value))

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Add holding"
      action="Add holding"
      onSubmit={async (form) => {
        const asset = String(form.get('asset'))
        const since = String(form.get('since'))
        setFault(isCanonical(asset) ? 'amount' : 'asset')
        if (!isCanonical(asset)) throw new Error('Choose an asset.')
        await setHolding(
          db,
          account.id,
          asset,
          String(form.get('amount')),
          since && since !== today ? since : undefined,
        )
        await onSaved()
      }}
    >
      {(error) => (
        <>
          <Field
            label="Asset"
            error={fault === 'asset' ? error : undefined}
            note={
              <a
                href="https://www.coingecko.com/en/api"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-ink"
              >
                Powered by CoinGecko API
              </a>
            }
          >
            <Combobox
              name="asset"
              options={available}
              placeholder="Search coins"
              onChange={(value) => setSymbol(options.find((o) => o.value === value)?.label)}
            />
          </Field>
          <AmountField error={fault === 'amount' ? error : undefined} symbol={symbol} />
          <Field label="Held since">
            <Input name="since" type="date" max={today} />
          </Field>
        </>
      )}
    </FormDialog>
  )
}

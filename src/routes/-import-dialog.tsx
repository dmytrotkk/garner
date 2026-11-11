import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { date, plural, quantity } from '../core/format.ts'
import {
  applyImport,
  type Blocked,
  type Line,
  type Plan,
  read,
  type Target,
} from '../data/imports.ts'
import { open as decode } from '../data/statement.ts'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'
import { type Column, Label } from '../ui/grid.tsx'
import { Picker } from '../ui/picker.tsx'
import { Table } from '../ui/table.tsx'
import { root } from './-data.ts'
import { next } from './-import.ts'
import { code, sum } from './-money.tsx'

function reason(blocked: Blocked) {
  switch (blocked.reason) {
    case 'nothing':
      return 'Nothing new: this file adds no rows.'
    case 'unrouted':
      return `Choose an account for ${blocked.label}.`
    case 'shared':
      return `${blocked.label} shares its account with another product.`
    case 'twice':
      return `${blocked.file} holds the row ${blocked.ref} twice.`
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

type Props = {
  title: string
  open: boolean
  onClose: () => void
  file: File
  institutionId: string | undefined
  accountId: string | undefined
  onDone: (institutionId: string) => Promise<unknown>
}

export function Import({ title, open, onClose, file, institutionId, accountId, onDone }: Props) {
  const { db } = root.useRouteContext()
  const { institutions } = root.useLoaderData()
  const [flow, send] = useReducer(next, { state: 'reading', pick: 0 })
  const [bank, setBank] = useState<string>()
  const picks = useRef(0)

  const load = useCallback(
    async (into: string | undefined) => {
      const pick = ++picks.current
      send({ type: 'pick', pick })
      try {
        const doc = decode(file.name, new Uint8Array(await file.arrayBuffer()))
        const { draft, route } = await read(db, [doc], into, accountId)
        if (draft.institution.fresh) setBank(draft.institution.name)
        send({ type: 'read', pick, draft, route })
      } catch (error) {
        send({ type: 'reject', pick, error: message(error) })
      }
    },
    [db, file, accountId],
  )
  useEffect(() => {
    load(institutionId)
  }, [load, institutionId])

  const busy = flow.state === 'applying'
  const planned = 'plan' in flow ? flow : undefined
  const preview = flow.state === 'preview' ? flow : undefined
  const apply = async () => {
    if (!planned) return
    send({ type: 'apply' })
    try {
      await applyImport(db, planned.plan)
      await onDone(planned.plan.institution.id)
      onClose()
    } catch (error) {
      send({ type: 'fail', error: message(error) })
    }
  }

  const columns: readonly Column<Line>[] = [
    {
      header: 'Account',
      cell: (line) => {
        const control = preview?.draft.controls.find(
          ({ key }) => preview.plan.route[key]?.accountId === line.accountId,
        )
        if (!preview || !control) return <Label text={line.account} note={code(line.assetId)} />
        const { route } = preview.plan
        const to = (target: Target) =>
          send({ type: 'route', route: { ...route, [control.key]: target } })
        const free = preview.draft.accounts.filter(({ id }) =>
          Object.entries(route).every(
            ([key, other]) => key === control.key || other.accountId !== id,
          ),
        )
        return (
          <span className="flex items-center gap-2">
            <Picker
              label={
                route[control.key]?.state === 'new' ? `New account: ${line.account}` : line.account
              }
              items={[
                ...free.map(({ id, name }) => ({
                  id,
                  label: name,
                  run: () => to({ state: 'account', accountId: id }),
                })),
                {
                  id: control.fresh.accountId,
                  label: `New account: ${control.fresh.name}`,
                  run: () => to(control.fresh),
                },
              ]}
            />
            <span className="text-dim">{code(line.assetId)}</span>
          </span>
        )
      },
    },
    { header: 'New rows', cell: ({ added }) => quantity(added) },
    { header: 'Known', cell: ({ known }) => quantity(known) },
    { header: 'Change', cell: (line) => sum(line.assetId, line.net) },
    { header: 'Balance', cell: (line) => sum(line.assetId, line.closing) },
  ]

  return (
    <Dialog
      title={title}
      wide
      open={open}
      onClose={() => !busy && onClose()}
      foot={
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!planned || busy || planned.plan.blocked !== null} onClick={apply}>
            Import
          </Button>
        </div>
      }
    >
      {flow.state === 'reading' && <p className="text-dim">Reading {file.name}.</p>}
      {flow.state === 'invalid' && <p className="text-negative">{flow.error}</p>}
      {planned && (
        <>
          <div className="flex items-center justify-between gap-4">
            <span className="text-dim">Institution</span>
            <Picker
              label={
                planned.plan.institution.fresh
                  ? `New institution: ${planned.plan.institution.name}`
                  : planned.plan.institution.name
              }
              disabled={!preview}
              items={[
                ...institutions.map(({ id, name }) => ({ id, label: name, run: () => load(id) })),
                ...(bank
                  ? [{ id: 'new', label: `New institution: ${bank}`, run: () => load(undefined) }]
                  : []),
              ]}
            />
          </div>
          <Table
            columns={columns}
            rows={planned.plan.lines}
            rowKey={({ accountId, assetId }) => `${accountId} ${assetId}`}
          />
          <Notes {...planned.plan} />
          {flow.state === 'failed' && <p className="text-negative">{flow.error}</p>}
        </>
      )}
    </Dialog>
  )
}

function Notes({ lines, skipped, unknown, replaced, blocked }: Plan) {
  const from = Math.min(...lines.map((line) => line.from))
  const to = Math.max(...lines.map((line) => line.to))
  const left = Object.entries(skipped).map(([state, count]) => `${quantity(count)} ${state}`)
  const types = Object.entries(unknown).map(([type, count]) => `${type} (${quantity(count)})`)
  return (
    <ul className="flex flex-col gap-1 text-dim">
      {lines.length > 0 && (
        <li>
          Rows from {date(from)} to {date(to)}.
        </li>
      )}
      {lines.map((line) =>
        line.coverage.state === 'ledger' && line.coverage.opening !== 0n ? (
          <li key={`${line.accountId} ${line.assetId}`}>
            {line.account} holds {sum(line.assetId, line.coverage.opening)} before its first row.
          </li>
        ) : null,
      )}
      {lines.map((line) =>
        line.coverage.state === 'ledger' && line.coverage.holes.length > 0 ? (
          <li key={`${line.accountId} ${line.assetId}`}>
            {line.account}: the printed balance does not follow the rows on{' '}
            {plural(line.coverage.holes.length, 'day')}.
          </li>
        ) : null,
      )}
      {left.length > 0 && <li>Rows left out: {left.join(', ')}.</li>}
      {types.length > 0 && (
        <li>Types garner does not know, kept as transfers: {types.join(', ')}.</li>
      )}
      {replaced > 0 && (
        <li>The file replaces {plural(replaced, 'typed balance')} inside this period.</li>
      )}
      {blocked && <li className="text-negative">{reason(blocked)}</li>}
    </ul>
  )
}

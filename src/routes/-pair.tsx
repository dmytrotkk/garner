import { ArrowRight } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { dash, date, day } from '../core/format'
import type { Proposal } from '../data/flows'
import { decide, saveRoute } from '../data/transfers'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Glyph } from '../ui/glyph'
import { Switch } from '../ui/switch'
import { root } from './-data'
import { sum } from './-money'

export function Arrow() {
  return <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-faint" strokeWidth={1.5} />
}

export function Account({ id, end }: { id: string; end?: boolean }) {
  const { accounts } = root.useLoaderData()
  const account = accounts.get(id)
  const glyph = account && <Glyph glyph={account.glyph} />
  return (
    <span className={`flex items-center gap-2 ${end ? 'justify-end' : ''}`}>
      {!end && glyph}
      {account?.name ?? dash}
      {end && glyph}
    </span>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-dim">{label}</span>
      <span>{value}</span>
    </div>
  )
}

type Props = {
  proposal: Proposal
  open: boolean
  onClose: () => void
  onSaved: () => Promise<void>
}

export function PairSheet({ proposal, open, onClose, onSaved }: Props) {
  const { db } = root.useRouteContext()
  const [always, setAlways] = useState(false)
  const [busy, setBusy] = useState(false)
  const { key, with: peer, from, to, time, arrived, assetId, sent, received } = proposal
  const pair = async () => {
    setBusy(true)
    try {
      await decide(db, key, { state: 'paired', with: peer })
      if (always) await saveRoute(db, from, to)
      await onSaved()
    } finally {
      setBusy(false)
    }
    onClose()
  }
  return (
    <Dialog
      title="Pair two movements"
      subtitle="Mark as a transfer between own accounts."
      open={open}
      onClose={() => !busy && onClose()}
      foot={
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={pair}>
            Pair
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 py-3">
        <div className="flex items-center gap-3 font-medium">
          <span className="flex-1">
            <Account id={from} />
          </span>
          <Arrow />
          <span className="flex-1">
            <Account id={to} end />
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex-1 border-line border-t border-dotted" />
          <span className="text-title">{sum(assetId, sent)}</span>
          <span className="flex-1 border-line border-t border-dotted" />
        </div>
        <div className="flex flex-col gap-2">
          <Row
            label="Date"
            value={day(time) === day(arrived) ? date(time) : `${day(time)} to ${date(arrived)}`}
          />
          {received !== sent && <Row label="Received" value={sum(assetId, received)} />}
          {received !== sent && <Row label="Fee" value={sum(assetId, sent - received)} />}
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Always pair similar transfers</span>
          <Switch label="Always pair similar transfers" checked={always} onChange={setAlways} />
        </div>
      </div>
    </Dialog>
  )
}

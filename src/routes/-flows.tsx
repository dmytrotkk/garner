import { useNavigate, useRouter } from '@tanstack/react-router'
import { dash, date, day, plural, quantity } from '../core/format'
import type { Proposal, Route } from '../data/flows'
import { forgetRoute, legKey, saveRoute } from '../data/transfers'
import { Button } from '../ui/button'
import { type Column, DataTable } from '../ui/data-table'
import { Match } from '../ui/match'
import { Notice } from '../ui/notice'
import { Label } from '../ui/table'
import { routeCommands } from './-commands'
import { root } from './-data'
import { ask } from './-layer'
import { sum } from './-money'
import { dismiss, useDismissal } from './-notice'
import { Account, Arrow } from './-pair'

export type Saved = Route & { saved: boolean }

export function Transfers({ routes }: { routes: readonly Saved[] }) {
  const { db } = root.useRouteContext()
  const { accounts } = root.useLoaderData()
  const router = useRouter()
  const nameOf = (id: string) => accounts.get(id)?.name ?? dash
  const columns: readonly Column<Saved>[] = [
    { id: 'from', header: 'From', cell: ({ from }) => nameOf(from), width: 'fill' },
    {
      id: 'to',
      header: 'To',
      cell: ({ to, saved }) => <Label text={nameOf(to)} note={saved ? 'saved' : null} />,
      width: 'lg',
    },
    { id: 'sent', header: 'Sent', cell: ({ assetId, sent }) => sum(assetId, sent), end: true },
    {
      id: 'received',
      header: 'Received',
      cell: ({ assetId, sent, received }) => (received === sent ? dash : sum(assetId, received)),
      end: true,
    },
    {
      id: 'count',
      header: 'Transfers',
      cell: ({ count }) => quantity(count),
      sort: ({ count }) => count,
      width: 'sm',
      end: true,
    },
    {
      id: 'last',
      header: 'Last',
      cell: ({ last }) => date(last),
      sort: ({ last }) => last,
      end: true,
    },
  ]
  const commands = (route: Saved) =>
    routeCommands(route, `${nameOf(route.from)} to ${nameOf(route.to)}`, async () => {
      await (route.saved ? forgetRoute : saveRoute)(db, route.from, route.to)
      await router.invalidate()
    })
  return (
    <DataTable
      columns={columns}
      rows={routes}
      rowKey={({ from, to, assetId }) => `${from} ${to} ${assetId}`}
      initial={{ id: 'count', desc: true }}
      link={({ from }) => ({ to: '/accounts/$accountId', params: { accountId: from } })}
      actions={{ items: commands, button: 'Route actions' }}
    />
  )
}

export function Proposals({ proposals }: { proposals: readonly Proposal[] }) {
  const columns: readonly Column<Proposal>[] = [
    {
      id: 'transfer',
      header: 'Transfer',
      cell: ({ from, to }) => (
        <span className="flex items-center gap-2.5">
          <Account id={from} />
          <Arrow />
          <Account id={to} />
        </span>
      ),
      width: 'fill',
    },
    { id: 'date', header: 'Date', cell: ({ time }) => day(time), sort: ({ time }) => time },
    { id: 'amount', header: 'Amount', cell: ({ assetId, sent }) => sum(assetId, sent), end: true },
  ]
  return (
    <DataTable
      columns={columns}
      rows={proposals}
      rowKey={({ key }) => legKey(key)}
      onOpen={(proposal) => ask({ kind: 'pair', proposal })}
    />
  )
}

export function useTransfersNotice() {
  const { proposed } = root.useLoaderData()
  const dismissal = useDismissal('transfers')
  const navigate = useNavigate()
  if (!proposed || dismissal.state === 'closed') return undefined
  return (
    <Notice
      lead={<Match />}
      title={`${plural(proposed, 'transfer')} between your accounts to confirm`}
      text="They count as spending until confirmed."
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate({ to: '/', hash: 'confirm' })}
        >
          Review
        </Button>
      }
      onClose={() => dismiss('transfers', proposed)}
    />
  )
}

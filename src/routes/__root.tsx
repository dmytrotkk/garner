import { Add01Icon, DashedLineCircleIcon, Settings01Icon } from '@hugeicons/core-free-icons'
import { createRootRouteWithContext, Outlet, useParams } from '@tanstack/react-router'
import { type DragEvent, useReducer } from 'react'
import { categories, pending } from '../data/categories'
import type { Db } from '../data/db'
import { proposals } from '../data/flows'
import type { Fetch, Host } from '../data/host'
import { movements } from '../data/ledger'
import { merchants } from '../data/merchants'
import { portfolio } from '../data/portfolio'
import { display, settings } from '../data/settings'
import { valuation } from '../data/spending'
import { Button } from '../ui/button'
import { Drop } from '../ui/drop'
import { Icon } from '../ui/icon'
import { Palette } from '../ui/palette'
import { Sidebar, SidebarAction, SidebarLink, SidebarSection } from '../ui/sidebar'
import { institutionCommands, pages, useCommands } from './-commands'
import { glyphOf } from './-institutions'
import { ask, close, load, useLayer } from './-layer'
import { MenuBar } from './-menubar'
import { Money } from './-money'
import { observe } from './-notice'
import { Prompts } from './-prompts'
import { Pending } from './-screens'
import { useFind } from './-search'
import { Bar, Toolbar, useSidebar } from './-window'

type Context = Pick<Host, 'links' | 'address'> & {
  db: Db
  desktop: boolean
  fetch: Fetch
}

export const Route = createRootRouteWithContext<Context>()({
  loader: async ({ context: { db } }) => {
    const [overview, stored, sorted, businesses, rows] = await Promise.all([
      portfolio(db),
      settings(db),
      categories(db),
      merchants(db),
      movements(db, { all: true }),
    ])
    const { movements: open, alike } = pending(rows)
    const proposed = proposals(rows).length
    observe('categorize', open)
    observe('transfers', proposed)
    const [context, shown] = await Promise.all([valuation(db, rows), display(db, stored.currency)])
    return {
      ...overview,
      ...stored,
      categories: sorted,
      byCategory: new Map(sorted.map((category) => [category.id, category])),
      accounts: new Map(
        overview.institutions.flatMap((institution) =>
          institution.accounts.map(({ id, name }) => [id, { name, glyph: glyphOf(institution) }]),
        ),
      ),
      merchants: businesses,
      rows,
      context,
      pending: open,
      proposed,
      alike,
      display: shown,
    }
  },
  pendingComponent: Pending,
  component: Shell,
})

const depth = (count: number, type: string) =>
  type === 'dragenter'
    ? count + 1
    : type === 'dragleave'
      ? Math.max(0, count - 1)
      : type === 'drop'
        ? 0
        : count

function Shell() {
  const { institutions } = Route.useLoaderData()
  const layer = useLayer()
  const commands = useCommands()
  const find = useFind(commands)
  const { desktop } = Route.useRouteContext()
  const shown = useSidebar()

  const { institutionId, accountId, merchantId, assetId } = useParams({ strict: false })
  const owner = institutions.find(({ accounts }) => accounts.some(({ id }) => id === accountId))
  const manual = owner?.accounts.find(({ id, kind }) => id === accountId && kind === 'manual')
  const held = assetId && (assetId.startsWith('fiat:') ? 'fiat' : 'crypto')
  const into = institutionId ?? manual?.institutionId
  const target = institutions.find(({ id }) => id === into)
  const current: Partial<Record<(typeof pages)[number][0], boolean>> = {
    '/crypto': held === 'crypto',
    '/fiat': held === 'fiat',
    '/categories': merchantId !== undefined,
  }

  const [dragged, drag] = useReducer(depth, 0)
  const take = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    drag(event.type)
    if (layer.kind === 'prompt') event.dataTransfer.dropEffect = 'none'
    if (event.type === 'drop') load([...event.dataTransfer.files], into, manual?.id)
  }
  const addInstitution = () => ask({ kind: 'add-institution' })

  return (
    <div
      role="none"
      className="relative isolate flex h-full"
      onDragEnter={take}
      onDragOver={take}
      onDragLeave={take}
      onDrop={take}
    >
      <Toolbar desktop={desktop} />
      <Sidebar
        collapsed={!shown}
        footer={<SidebarLink link={{ to: '/settings' }} icon={Settings01Icon} label="Settings" />}
      >
        {pages.slice(0, 4).map(([to, label, icon]) => (
          <SidebarLink
            key={to}
            link={{ to }}
            current={current[to] ?? false}
            icon={icon}
            label={label}
          />
        ))}
        <SidebarSection
          label="Institutions"
          action={
            <Button variant="ghost" size="sm" aria-label="Add institution" onClick={addInstitution}>
              <Icon icon={Add01Icon} />
            </Button>
          }
        >
          {institutions.map((institution) => (
            <SidebarLink
              key={institution.id}
              link={{
                to: '/institutions/$institutionId',
                params: { institutionId: institution.id },
              }}
              current={institution.id === owner?.id}
              icon={glyphOf(institution)}
              label={institution.name}
              menu={institutionCommands(institution)}
              trailing={<Money value={institution.value} format="compact" />}
            />
          ))}
          {!institutions.length && (
            <SidebarAction
              muted
              icon={DashedLineCircleIcon}
              label="New institution…"
              onSelect={addInstitution}
            />
          )}
        </SidebarSection>
      </Sidebar>
      <div className="relative flex min-w-0 flex-1 flex-col bg-canvas">
        <Bar desktop={desktop} />
        <Outlet />
      </div>
      <Prompts />
      <Drop
        open={dragged > 0 && layer.kind !== 'prompt'}
        into={target && { name: target.name, glyph: glyphOf(target) }}
      />
      {desktop && <MenuBar commands={commands} />}
      <Palette
        open={layer.kind === 'palette'}
        onClose={() => close('palette')}
        find={find}
        initial={layer.kind === 'palette' ? layer.query : ''}
        placeholder="Search movements, merchants, accounts and more"
      />
    </div>
  )
}

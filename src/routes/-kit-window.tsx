import { EthereumIcon, Home03Icon, SidebarLeftIcon } from '@hugeicons/core-free-icons'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '../ui/card'
import { Glass, type GlassItem, GlassSearch } from '../ui/glass'
import { Icon } from '../ui/icon'
import { Section } from '../ui/page'

const noop = () => {}

const chevron = { className: 'size-6 shrink-0', strokeWidth: 1.5, absoluteStrokeWidth: true }

const sidebar: GlassItem = {
  label: 'Hide sidebar',
  icon: <Icon icon={SidebarLeftIcon} stroke={1.5} />,
  onClick: noop,
}
const history: readonly GlassItem[] = [
  { label: 'Back', icon: <ChevronLeft {...chevron} />, onClick: noop },
  { label: 'Forward', icon: <ChevronRight {...chevron} />, onClick: noop, disabled: true },
]

const lit = [
  ['#f8766c', '#c9271f'],
  ['#fdc630', '#c98a00'],
  ['#7bd254', '#2f8f14'],
]
const unlit = Array<string[]>(3).fill(['#e6e7ea', '#a5a6aa'])

function Lights({ inactive }: { inactive: boolean }) {
  return (
    <svg width={60} height={14} aria-hidden="true" className="shrink-0">
      {(inactive ? unlit : lit).map(([fill, stroke], index) => (
        <circle
          key={7 + index * 23}
          cx={7 + index * 23}
          cy={7}
          r={6.75}
          fill={fill}
          stroke={stroke}
          strokeWidth={0.5}
        />
      ))}
    </svg>
  )
}

function Row({
  icon,
  label,
  active,
}: {
  icon: typeof Home03Icon
  label: string
  active?: boolean
}) {
  return (
    <span
      className={`flex h-8 items-center gap-2.5 rounded-control px-3.75 ${active ? 'bg-fill text-ink' : ''}`}
    >
      <Icon icon={icon} />
      {label}
    </span>
  )
}

type WindowProps = { caption: string; open?: boolean; inactive?: boolean }

function Window({ caption, open = true, inactive = false }: WindowProps) {
  const toggle = <Glass items={[{ ...sidebar, label: open ? 'Hide sidebar' : 'Show sidebar' }]} />
  return (
    <figure className="flex flex-col gap-2">
      <div
        data-inactive={inactive || undefined}
        className="flex h-44 overflow-hidden rounded-surface border border-line bg-canvas"
      >
        {open && (
          <div className="flex w-52.25 shrink-0 flex-col bg-sidebar">
            <div className="flex h-13 shrink-0 items-center justify-between pr-2.75 pl-4.75">
              <Lights inactive={inactive} />
              {toggle}
            </div>
            <div className="flex flex-col px-2 font-medium text-dim text-nav **:data-icon:size-3.75">
              <Row icon={Home03Icon} label="Home" active />
              <Row icon={EthereumIcon} label="Crypto" />
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={`flex h-13 shrink-0 items-center gap-2.75 pr-2.75 ${open ? 'pl-2.75' : 'pl-4.75'}`}
          >
            {!open && (
              <>
                <Lights inactive={inactive} />
                {toggle}
              </>
            )}
            <Glass items={history} />
            <span className="ml-auto flex">
              <GlassSearch onClick={noop} />
            </span>
          </div>
          <span className="truncate px-8 text-heading">Revolut Current</span>
        </div>
      </div>
      <figcaption className="text-dim">{caption}</figcaption>
    </figure>
  )
}

export function KitWindow() {
  const buttons = (
    <>
      <Glass items={[sidebar]} />
      <Glass items={history} />
      <GlassSearch onClick={noop} />
    </>
  )
  return (
    <Section title="Window">
      <Card
        title="Glass buttons"
        description="32px, a hairline rim, top and bottom highlights, a 24px circle under the pointer, darker while pressed; the search field is the same glass"
      >
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2 rounded-surface bg-sidebar p-4">{buttons}</div>
          <div data-inactive className="flex items-center gap-2 rounded-surface bg-sidebar p-4">
            {buttons}
          </div>
        </div>
      </Card>
      <div className="grid gap-4">
        <Window caption="Sidebar open" />
        <Window caption="Sidebar closed" open={false} />
        <Window caption="Inactive window" inactive />
      </div>
    </Section>
  )
}

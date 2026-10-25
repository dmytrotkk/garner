import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { Action } from './command'
import { Glyph } from './glyph'
import { menuOn } from './menu'

const row =
  'flex h-8 w-full items-center gap-2.5 rounded-control pr-2.5 pl-3.75 text-dim transition not-aria-[current=page]:hover:bg-fill/50 not-aria-[current=page]:data-menu-open:bg-fill/50 aria-[current=page]:bg-fill aria-[current=page]:text-ink'

type ItemProps = { icon: Glyph; label: string; trailing?: ReactNode }

function Content({ icon, label, trailing }: ItemProps) {
  return (
    <>
      <Glyph glyph={icon} />
      <span className="truncate">{label}</span>
      {trailing && <span className="ml-auto font-normal text-caption text-dim">{trailing}</span>}
    </>
  )
}

type Props = { collapsed: boolean; footer: ReactNode; children: ReactNode }

export function Sidebar({ collapsed, footer, children }: Props) {
  return (
    <div
      inert={collapsed}
      className={`flex shrink-0 overflow-hidden transition-all duration-250 motion-reduce:transition-none ${collapsed ? 'w-0' : 'w-52.25'}`}
    >
      <nav
        className={`flex w-52.25 shrink-0 select-none flex-col bg-sidebar p-2 font-medium text-nav transition-transform duration-250 motion-reduce:transition-none in-data-desktop:bg-transparent **:data-icon:size-3.75 ${collapsed ? '-translate-x-full' : ''}`}
      >
        <header data-tauri-drag-region className="-mx-2 -mt-2 h-13 shrink-0" />
        <div className="-mx-2 -my-1 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-1">
          {children}
        </div>
        <footer className="flex shrink-0 flex-col pt-3">{footer}</footer>
      </nav>
    </div>
  )
}

type LinkItemProps = ItemProps & {
  link: LinkProps
  current?: boolean
  menu?: readonly Action[]
}

export function SidebarLink({ link, current, menu = [], ...item }: LinkItemProps) {
  return (
    <Link
      {...link}
      {...(current && { inactiveProps: { 'aria-current': 'page' } })}
      className={row}
      {...menuOn(menu)}
    >
      <Content {...item} />
    </Link>
  )
}

type ActionProps = ItemProps & { muted?: boolean; onSelect: () => void }

export function SidebarAction({ muted, onSelect, ...item }: ActionProps) {
  return (
    <button type="button" onClick={onSelect} className={`${row} ${muted ? 'font-normal' : ''}`}>
      <Content {...item} />
    </button>
  )
}

type SectionProps = { label: string; action?: ReactNode; children: ReactNode }

export function SidebarSection({ label, action, children }: SectionProps) {
  return (
    <section className="group mt-3 flex flex-col">
      <header className="flex h-8 items-center justify-between pl-2.5 text-caption text-faint">
        {label}
        <span className="opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          {action}
        </span>
      </header>
      {children}
    </section>
  )
}

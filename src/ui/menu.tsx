import { Menu as Base } from '@base-ui/react/menu'
import type { ReactElement } from 'react'
import { title } from '../core/format.ts'
import type { Action, Command } from './command.ts'
import type { SymbolName } from './symbols.ts'

export type Item = Pick<Command, 'id' | 'label' | 'tone' | 'run'>

export type Point = { x: number; y: number }
export type Entry = { label: string; symbol: SymbolName; separated: boolean }
export type Native = (
  entries: readonly Entry[],
  at: Point,
  pick: (index: number) => void,
) => Promise<void>

let native: Native | undefined

export function provideMenu(menu: Native) {
  native = menu
}

type Press = {
  clientX: number
  clientY: number
  currentTarget: {
    toggleAttribute: (name: string, force: boolean) => boolean
    getBoundingClientRect: () => Pick<DOMRect, 'left' | 'bottom'>
  }
  preventDefault: () => void
}

const open = (show: Native, items: readonly Action[], at: Point, event: Press, flag: string) => {
  const target = event.currentTarget
  target.toggleAttribute(flag, true)
  return show(
    items.map(({ label, symbol, tone }, index) => ({
      label: title(label),
      symbol,
      separated: tone === 'negative' && index > 0,
    })),
    at,
    (index) => items[index]?.run(),
  ).finally(() => target.toggleAttribute(flag, false))
}

export function menuOn(items: readonly Action[]) {
  const show = native
  if (!show || !items.length) return {}
  return {
    onContextMenu: (event: Press) => {
      event.preventDefault()
      return open(show, items, { x: event.clientX, y: event.clientY }, event, 'data-menu-open')
    },
  }
}

export function menuUnder(items: readonly Action[]) {
  const show = native
  if (!show || !items.length) return undefined
  return (event: Press) => {
    const { left, bottom } = event.currentTarget.getBoundingClientRect()
    return open(show, items, { x: left, y: bottom + 4 }, event, 'data-popup-open')
  }
}

export function Menu({ trigger, items }: { trigger: ReactElement; items: readonly Item[] }) {
  return (
    <Base.Root>
      <Base.Trigger render={trigger} />
      <Base.Portal>
        <Base.Positioner align="end" sideOffset={4}>
          <Base.Popup className="min-w-36 origin-(--transform-origin) rounded-surface border border-line bg-surface p-1 shadow-popover outline-none transition data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:scale-95">
            {items.map(({ id, label, tone, run }) => (
              <Base.Item
                key={id}
                onClick={run}
                className={`flex h-7 select-none items-center rounded-control px-2 outline-none data-highlighted:bg-fill ${tone === 'negative' ? 'text-negative' : ''}`}
              >
                {label}
              </Base.Item>
            ))}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  )
}

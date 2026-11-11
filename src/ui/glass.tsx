import { Search01Icon } from '@hugeicons/core-free-icons'
import { Fragment, type ReactNode } from 'react'
import { Icon } from './icon.tsx'
import { Kbd } from './kbd.tsx'

export type GlassItem = {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}

export function GlassSearch({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-keyshortcuts="Meta+K"
      className="glass group flex h-8 w-50 shrink-0 items-center gap-2 rounded-glass pr-2 pl-3 text-dim **:data-icon:size-4.5"
    >
      <Icon icon={Search01Icon} stroke={1.5} />
      Search
      <span aria-hidden className="ml-auto flex opacity-0 transition group-hover:opacity-100">
        <Kbd>⌘K</Kbd>
      </span>
    </button>
  )
}

export function Glass({ items }: { items: readonly GlassItem[] }) {
  return (
    <span className="glass flex shrink-0 items-center rounded-glass text-ink">
      {items.map(({ label, icon, onClick, disabled }, index) => (
        <Fragment key={label}>
          {index > 0 && <span data-divider className="h-4.5 w-px bg-ink/25" />}
          <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className="flex size-8 items-center justify-center rounded-glass bg-clip-content p-1 enabled:hover:bg-fill enabled:active:bg-ink/12 disabled:text-ink/25 **:data-icon:size-4.5"
          >
            {icon}
          </button>
        </Fragment>
      ))}
    </span>
  )
}

import { Tooltip as Base } from '@base-ui/react/tooltip'
import type { ReactElement, ReactNode } from 'react'

type Props = { label: ReactNode; onOpenChange?: (open: boolean) => void; children: ReactElement }

export function Tooltip({ label, onOpenChange, children }: Props) {
  return (
    <Base.Root onOpenChange={onOpenChange}>
      <Base.Trigger render={children} />
      <Base.Portal>
        <Base.Positioner sideOffset={6}>
          <Base.Popup className="origin-(--transform-origin) max-w-80 wrap-break-word rounded-control border border-line bg-surface px-2 py-1 text-caption shadow-popover transition data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:scale-95">
            {label}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  )
}

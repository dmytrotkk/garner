import { Dialog as Base } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: ReactNode
  head?: ReactNode
  foot?: ReactNode
  wide?: boolean
  open: boolean
  onClose: () => void
  children: ReactNode
}

const bar = 'absolute inset-x-0 z-10 flex backdrop-blur-glass'

const measured = (name: string) => (node: HTMLDivElement | null) => {
  const box = node?.parentElement
  if (!node || !box) return
  const fit = () => box.style.setProperty(name, `${node.offsetHeight}px`)
  const sizes = new ResizeObserver(fit)
  sizes.observe(node)
  fit()
  return () => {
    sizes.disconnect()
    box.style.removeProperty(name)
  }
}

export function Dialog({ title, subtitle, head, foot, wide, open, onClose, children }: Props) {
  return (
    <Base.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 bg-scrim transition data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Base.Popup
          className={`fixed inset-6 m-auto flex h-fit max-h-full w-full flex-col overflow-hidden rounded-sheet border border-ink/8 shadow-sheet transition data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:-translate-y-2 motion-safe:data-starting-style:-translate-y-2 ${wide ? 'max-w-192' : 'max-w-110'}`}
        >
          <div className="absolute inset-0 rounded-sheet bg-surface/85 backdrop-blur-glass" />
          <div
            ref={measured('--head')}
            className={`${bar} top-0 flex-col gap-3 rounded-t-sheet px-4 pt-4 pb-3`}
          >
            <div className="flex flex-col gap-0.5">
              <Base.Title className="font-medium text-nav">{title}</Base.Title>
              {subtitle && (
                <Base.Description className="flex items-center gap-1.5 text-dim">
                  {subtitle}
                </Base.Description>
              )}
            </div>
            {head}
          </div>
          <div className="scrollbar-none relative flex max-h-160 min-h-0 flex-col gap-5 overflow-y-auto px-4 pt-(--head) pb-(--foot)">
            {children}
          </div>
          {foot && (
            <div
              ref={measured('--foot')}
              className={`${bar} bottom-0 items-center justify-between gap-4 rounded-b-sheet px-4 pt-3 pb-4`}
            >
              {foot}
            </div>
          )}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  )
}

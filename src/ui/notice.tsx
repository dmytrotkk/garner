import { Cancel01Icon } from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import { Button } from './button.tsx'
import type { IconSvgElement } from './icon.tsx'
import { Icon } from './icon.tsx'

const tones = {
  neutral: 'text-dim',
  positive: 'text-positive',
  warning: 'text-warning',
  negative: 'text-negative',
}

type Lead = { icon: IconSvgElement; tone?: keyof typeof tones } | { lead: ReactNode }

type Props = Lead & {
  title: string
  text?: string
  action?: ReactNode
  onClose?: () => void
}

export function Notice({ title, text, action, onClose, ...lead }: Props) {
  return (
    <div
      role="status"
      className={`flex items-center rounded-glass border border-ink/8 bg-surface/90 p-3 shadow-popover backdrop-blur-bar ${'lead' in lead ? 'gap-4' : 'gap-3 pl-4'}`}
    >
      {'lead' in lead ? (
        lead.lead
      ) : (
        <span className={tones[lead.tone ?? 'neutral']}>
          <Icon icon={lead.icon} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{title}</span>
        {text && <span className="text-dim">{text}</span>}
      </div>
      {action}
      {onClose && (
        <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
          <Icon icon={Cancel01Icon} />
        </Button>
      )}
    </div>
  )
}

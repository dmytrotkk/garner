import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { Button } from './button.tsx'
import { Icon } from './icon.tsx'
import { type Item, Menu } from './menu.tsx'

type Props = { label: string; items: readonly Item[]; disabled?: boolean; aria?: string }

export function Picker({ label, items, disabled = false, aria }: Props) {
  return (
    <Menu
      items={items}
      trigger={
        <Button variant="secondary" size="sm" disabled={disabled} aria-label={aria}>
          {label}
          <Icon icon={ArrowDown01Icon} />
        </Button>
      }
    />
  )
}

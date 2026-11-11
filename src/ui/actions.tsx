import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { Button } from './button.tsx'
import type { Action, Command } from './command.ts'
import { Icon } from './icon.tsx'
import { Menu, menuUnder } from './menu.tsx'

type Props = { label: string; items: readonly Action[]; primary?: Command | undefined }

export function Actions({ label, items, primary }: Props) {
  const native = menuUnder(items)
  const dots = (
    <Button variant="ghost" size="sm" aria-label={label} {...(native && { onClick: native })}>
      <Icon icon={MoreHorizontalIcon} />
    </Button>
  )
  const menu = native ? dots : <Menu items={items} trigger={dots} />
  if (!primary) return menu
  return (
    <span className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={primary.run}>
        {primary.label}
      </Button>
      {menu}
    </span>
  )
}

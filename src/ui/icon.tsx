import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'

type Props = { icon: IconSvgElement; stroke?: number }

export function Icon({ icon, stroke = 2 }: Props) {
  return <HugeiconsIcon data-icon icon={icon} strokeWidth={stroke} className="size-4 shrink-0" />
}

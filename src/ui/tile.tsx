import type { Hue } from './hues.ts'
import type { IconSvgElement } from './icon.tsx'
import { Icon } from './icon.tsx'

const sizes = {
  sm: 'size-5 **:data-icon:size-3.5',
  md: 'size-8 **:data-icon:size-5',
  lg: 'size-12 **:data-icon:size-7',
}

const variants = { soft: 'bg-tile text-tile', solid: 'bg-tile-solid' }

type Props = {
  hue: Hue
  icon: IconSvgElement
  size?: keyof typeof sizes
  variant?: keyof typeof variants
}

export const Blank = () => <span className="size-5 shrink-0 rounded-tile bg-fill" />

export function Tile({ hue, icon, size = 'md', variant = 'soft' }: Props) {
  return (
    <span
      data-hue={hue}
      className={`grid shrink-0 place-items-center rounded-tile ${variants[variant]} ${sizes[size]}`}
    >
      <Icon icon={icon} />
    </span>
  )
}

import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import type { IconSvgElement } from '@hugeicons/react'
import { useId } from 'react'
import { Icon } from './icon'

type Props = {
  name: string
  label: string
  icons: Readonly<Record<string, IconSvgElement>>
  initial: string
}

export function IconGrid({ name, label, icons, initial }: Props) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="font-medium">
        {label}
      </span>
      <RadioGroup
        name={name}
        defaultValue={initial}
        aria-labelledby={id}
        className="grid w-fit grid-cols-10 gap-1"
      >
        {Object.entries(icons).map(([value, icon]) => (
          <Radio.Root
            key={value}
            value={value}
            aria-label={value}
            className="grid size-8 place-items-center rounded-control text-dim transition hover:bg-fill/50 data-checked:bg-fill data-checked:text-ink"
          >
            <Icon icon={icon} />
          </Radio.Root>
        ))}
      </RadioGroup>
    </div>
  )
}

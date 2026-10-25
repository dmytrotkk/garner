import { Combobox as Base } from '@base-ui/react/combobox'
import type { IconSvgElement } from '@hugeicons/react'
import { type ReactNode, useMemo, useState } from 'react'
import { search } from '../core/search'
import { Icon } from './icon'
import { field } from './input'
import { Label } from './table'

export type Option = {
  value: string
  label: string
  note: string
  icon?: IconSvgElement
  aside?: ReactNode
}

type Props = {
  name: string
  options: readonly Option[]
  placeholder: string
  initial?: string | undefined
  onChange?: (value: string | null) => void
}

export function Combobox({ name, options, placeholder, initial, onChange }: Props) {
  const [text, setText] = useState('')
  const searchable = useMemo(
    () => options.map((option) => ({ group: '', label: option.label, note: option.note, option })),
    [options],
  )
  const items = useMemo(
    () =>
      Base.createItems([...options], {
        getValue: ({ value }) => value,
        getLabel: ({ label }) => label,
      }),
    [options],
  )
  return (
    <Base.Root
      items={items}
      name={name}
      defaultValue={initial}
      limit={50}
      filteredItems={search(searchable, text, 50).flatMap((group) =>
        group.items.map(({ option }) => option),
      )}
      onInputValueChange={setText}
      autoHighlight
      onValueChange={(value) => onChange?.(value)}
    >
      <Base.Input
        placeholder={placeholder}
        autoCorrect="off"
        spellCheck={false}
        className={field}
      />
      <Base.Portal>
        <Base.Positioner sideOffset={4}>
          <Base.Popup className="w-(--anchor-width) origin-(--transform-origin) rounded-surface border border-line bg-surface p-1 shadow-popover transition data-ending-style:opacity-0 data-starting-style:opacity-0">
            <Base.Empty className="flex h-8 items-center px-2 text-dim empty:hidden">
              Nothing found.
            </Base.Empty>
            <Base.List className="max-h-64 overflow-y-auto">
              {({ value, label, note, icon, aside }: Option) => (
                <Base.Item
                  key={value}
                  value={value}
                  className="flex h-9 select-none items-center gap-2 rounded-control px-2.5 outline-none data-highlighted:bg-fill"
                >
                  {icon && <Icon icon={icon} />}
                  <Label text={label} note={note} />
                  {aside && <span className="ml-auto shrink-0">{aside}</span>}
                </Base.Item>
              )}
            </Base.List>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  )
}

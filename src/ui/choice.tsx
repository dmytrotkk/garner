import { useState } from 'react'
import { Picker } from './picker'

type Option = { value: string; label: string }

type Props = {
  label: string
  name: string
  options: readonly Option[]
  initial?: string | undefined
}

export function Choice({ label, name, options, initial }: Props) {
  const [value, setValue] = useState(initial)
  const current = options.find((option) => option.value === value) ?? options[0]
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-medium">{label}</span>
      <input type="hidden" name={name} value={current?.value ?? ''} />
      <Picker
        label={current?.label ?? ''}
        aria={`${label}: ${current?.label}`}
        items={options.map((option) => ({
          id: option.value,
          label: option.label,
          run: () => setValue(option.value),
        }))}
      />
    </div>
  )
}

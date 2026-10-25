import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'

type Option<Value extends string> = { value: Value; label: string }

type Props<Value extends string> = {
  label: string
  value: Value
  options: readonly Option<Value>[]
  onChange: (value: Value) => void
}

export function Segmented<Value extends string>({ label, value, options, onChange }: Props<Value>) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => {
        const found = options.find((option) => option.value === next)
        if (found) onChange(found.value)
      }}
      aria-label={label}
      className="flex h-7 shrink-0 gap-0.5 rounded-control bg-fill p-0.5 text-caption"
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className="inline-flex items-center rounded-chip px-2.5 font-medium text-dim transition hover:text-ink data-checked:bg-fill data-checked:text-ink"
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}

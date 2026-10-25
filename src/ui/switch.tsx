import { Switch as Base } from '@base-ui/react/switch'

type Props = { label: string; checked: boolean; onChange: (checked: boolean) => void }

export function Switch({ label, checked, onChange }: Props) {
  return (
    <Base.Root
      aria-label={label}
      checked={checked}
      onCheckedChange={onChange}
      className="flex h-4 w-7 shrink-0 items-center rounded-control bg-shade p-0.5 transition data-checked:bg-positive"
    >
      <Base.Thumb className="size-3 rounded-control bg-knob transition data-checked:translate-x-3" />
    </Base.Root>
  )
}

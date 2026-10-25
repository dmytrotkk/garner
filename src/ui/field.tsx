import { Field as Base } from '@base-ui/react/field'
import type { ReactNode } from 'react'

type Props = { label: string; error?: string | undefined; note?: ReactNode; children: ReactNode }

export function Field({ label, error, note, children }: Props) {
  return (
    <Base.Root invalid={!!error} className="flex flex-col gap-1.5">
      <Base.Label className="font-medium">{label}</Base.Label>
      {children}
      {note && <Base.Description className="text-caption text-dim">{note}</Base.Description>}
      <Base.Error match={!!error} className="text-caption text-negative">
        {error}
      </Base.Error>
    </Base.Root>
  )
}

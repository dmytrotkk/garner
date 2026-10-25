import type { ReactNode } from 'react'

type GroupProps = { label: string; note?: string; children: ReactNode }

export function SettingsGroup({ label, note, children }: GroupProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-dim">{label}</h2>
      <div className="flex flex-col rounded-surface border border-line bg-surface px-3">
        {children}
      </div>
      {note && <p className="text-dim">{note}</p>}
    </section>
  )
}

type RowProps = { title: string; description: string; children: ReactNode }

export function SettingsRow({ title, description, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-line border-t py-2.5 first:border-t-0">
      <div className="flex flex-col">
        <span>{title}</span>
        <span className="text-dim">{description}</span>
      </div>
      {children}
    </div>
  )
}

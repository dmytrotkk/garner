import type { ReactNode } from 'react'

type Props = { title?: string; description?: string; children: ReactNode }

export function Card({ title, description, children }: Props) {
  return (
    <section className="flex flex-col gap-4 rounded-surface border border-line bg-surface p-5">
      {title && (
        <header className="flex flex-col">
          <h2>{title}</h2>
          {description && <span className="text-dim">{description}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

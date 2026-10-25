import type { ReactNode } from 'react'
import { type Noticed, Notices } from './notices'
import { Scroller } from './scroller'

type Props = {
  title: string
  lead?: ReactNode
  action?: ReactNode
  narrow?: boolean
  empty?: string | false
  notices?: readonly Noticed[] | undefined
  children?: ReactNode
}

export function Page({ title, lead, action, narrow, empty, notices, children }: Props) {
  return (
    <Scroller>
      <div
        className={`mx-auto flex min-h-full flex-col gap-8 px-8 pt-19 pb-12 ${narrow ? 'max-w-176' : 'max-w-240'}`}
      >
        <header className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-3">
            {lead}
            <h1 className="text-heading">{title}</h1>
          </span>
          {action}
        </header>
        {empty ? <p className="text-dim">{empty}</p> : children}
        {notices && <Notices items={notices} />}
      </div>
    </Scroller>
  )
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-dim">{label}</span>
      <span className="text-title">{value}</span>
    </div>
  )
}

type SectionProps = {
  id?: string
  title: string
  action?: ReactNode
  empty?: string | false
  children: ReactNode
}

export function Section({ id, title, action, empty, children }: SectionProps) {
  return (
    <section id={id} className="flex flex-col gap-3">
      <header className="flex h-7 items-center justify-between gap-4">
        <h2 className="font-medium">{title}</h2>
        {action}
      </header>
      {empty ? <p className="text-dim">{empty}</p> : children}
    </section>
  )
}

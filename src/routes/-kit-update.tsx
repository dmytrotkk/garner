import { EthereumIcon, Home03Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { Card } from '../ui/card'
import { Icon } from '../ui/icon'
import { Section } from '../ui/page'
import { Segmented } from '../ui/segmented'
import { type PendingUpdate, UpdateCard } from '../ui/update-card'

type State = PendingUpdate['state']

const states = [
  { value: 'available', label: 'Available' },
  { value: 'installing', label: 'Updating' },
  { value: 'ready', label: 'Ready' },
  { value: 'failed', label: 'Failed' },
] as const

const next: Record<State, State> = {
  available: 'installing',
  installing: 'installing',
  ready: 'available',
  failed: 'installing',
}

const version = '0.1.1'

function Row({ icon, label, active }: { icon: IconSvgElement; label: string; active?: boolean }) {
  return (
    <span
      className={`flex h-8 items-center gap-2.5 rounded-control pr-2.5 pl-3.75 ${active ? 'bg-fill text-ink' : ''}`}
    >
      <Icon icon={icon} />
      <span className="truncate">{label}</span>
    </span>
  )
}

export function KitUpdate() {
  const [state, setState] = useState<State>('available')
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (state !== 'installing') return
    let done = 0
    const timer = setInterval(() => {
      done += 0.02
      if (done < 1.2) setProgress(Math.min(done, 1))
      else setState('ready')
    }, 50)
    return () => {
      clearInterval(timer)
      setProgress(0)
    }
  }, [state])
  const update: PendingUpdate =
    state === 'installing'
      ? { state, version, progress }
      : state === 'failed'
        ? { state, version, reason: 'Could not connect' }
        : { state, version }
  return (
    <Section
      title="Update"
      action={<Segmented label="State" value={state} options={states} onChange={setState} />}
    >
      <Card
        title="Sidebar card"
        description="A well above Settings with the app icon and one glass capsule. While it updates the capsule fills as a progress bar, then reads Restart. Its button runs the flow here."
      >
        <div className="flex h-80 w-52.25 select-none flex-col rounded-surface border border-line bg-sidebar p-2 font-medium text-dim text-nav **:data-icon:size-3.75">
          <div className="h-11" />
          <Row icon={Home03Icon} label="Home" active />
          <Row icon={EthereumIcon} label="Crypto" />
          <footer className="mt-auto flex flex-col gap-2 pt-3">
            <UpdateCard update={update} onAction={() => setState(next[state])} />
            <Row icon={Settings01Icon} label="Settings" />
          </footer>
        </div>
      </Card>
    </Section>
  )
}

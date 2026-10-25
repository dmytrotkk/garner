import { Tick02Icon } from '@hugeicons/core-free-icons'
import { Icon } from './icon'

function Ledger() {
  return (
    <span className="flex h-5 w-3.5 shrink-0 flex-col justify-between rounded-chip border border-line bg-surface px-0.5 py-0.75">
      <span className="h-0.5 rounded-chip bg-fill" />
      <span data-hit data-hue="brass" className="h-0.5 rounded-chip bg-tile-solid" />
      <span className="h-0.5 rounded-chip bg-fill" />
    </span>
  )
}

export function Match() {
  return (
    <span
      aria-hidden="true"
      className="match relative flex h-11 w-11 shrink-0 items-center justify-between rounded-control border border-line bg-surface px-1.5"
    >
      <Ledger />
      <span
        data-tick
        data-hue="green"
        className="absolute top-1/2 left-1/2 grid size-3 -translate-1/2 place-items-center rounded-tile bg-tile-solid text-surface **:data-icon:size-2"
      >
        <Icon icon={Tick02Icon} stroke={3} />
      </span>
      <Ledger />
    </span>
  )
}

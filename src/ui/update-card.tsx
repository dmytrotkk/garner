import { mark } from './logo'

export type PendingUpdate =
  | { state: 'available'; version: string }
  | { state: 'installing'; version: string; progress: number }
  | { state: 'ready'; version: string }
  | { state: 'failed'; version: string; reason: string }

const steps = {
  available: { status: 'Available', action: 'Update' },
  installing: { status: 'Updating…', action: null },
  ready: { status: 'Installed', action: 'Restart' },
  failed: { status: null, action: 'Try again' },
} as const

type Props = { update: PendingUpdate; onAction: () => void }

export function UpdateCard({ update, onAction }: Props) {
  const { status, action } = steps[update.state]
  return (
    <div className="update-card flex flex-col gap-2 rounded-sheet bg-fill p-2">
      <div className="flex items-center gap-2.5">
        <span
          data-app
          data-hue="green"
          className="grid size-8 shrink-0 place-items-center rounded-tile bg-tile-solid"
        >
          <svg viewBox={mark.viewBox} aria-hidden="true" className="size-4.5 fill-current">
            <path d={mark.d} />
          </svg>
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-body text-ink">Garner {update.version}</span>
          <span
            role="status"
            className={`truncate font-normal text-caption ${update.state === 'failed' ? 'text-negative' : 'text-dim'}`}
          >
            {update.state === 'failed' ? update.reason : status}
          </span>
        </span>
      </div>
      <span
        className={`glass flex h-7 rounded-glass text-ink ${update.state === 'installing' ? 'overflow-hidden' : ''}`}
      >
        {update.state === 'installing' ? (
          <progress
            data-hue="green"
            value={update.progress}
            aria-label="Updating"
            className="h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="flex flex-1 items-center justify-center rounded-glass bg-clip-content p-0.5 font-medium text-body hover:bg-fill active:bg-ink/12"
          >
            {action}
          </button>
        )}
      </span>
    </div>
  )
}

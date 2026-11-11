import { Glyph } from './glyph.tsx'
import type { Hue } from './hues.ts'

const cards = ['left', 'right', 'front'] as const

const rows: readonly Hue[] = ['lime', 'orange', 'blue', 'rose']

const lines = ['w-9', 'w-6', 'w-8', 'w-5']

type Props = { open: boolean; into: { name: string; glyph: Glyph } | undefined }

export function Drop({ open, into }: Props) {
  return (
    <div
      aria-hidden="true"
      data-open={open || undefined}
      className={`drop pointer-events-none fixed inset-0 z-50 grid place-items-center bg-canvas/75 transition ${open ? 'backdrop-blur-veil' : 'opacity-0'}`}
    >
      <div className="flex flex-col items-center gap-5">
        <div data-hand className="relative h-28 w-36">
          {cards.map((side, card) => (
            <span
              key={side}
              data-card={side}
              className="absolute inset-x-0 top-1 mx-auto flex h-24 w-18 flex-col justify-between rounded-control border border-line bg-surface p-2 shadow-popover"
            >
              <span className="flex items-center gap-1.5">
                {side === 'front' && into ? (
                  <Glyph glyph={into.glyph} />
                ) : (
                  <span className="size-4 rounded-chip bg-fill" />
                )}
                <span className="h-1.5 w-7 rounded-chip bg-fill" />
              </span>
              <span className="flex flex-col gap-1">
                {rows.map((hue, row) => (
                  <span key={hue} className="flex items-center gap-1.5">
                    <span
                      data-hue={hue}
                      className={`size-2.5 rounded-tile ${side === 'front' ? 'bg-tile-solid' : 'bg-fill'}`}
                    />
                    <span
                      className={`h-1 rounded-chip bg-fill ${lines[(row + card) % lines.length]}`}
                    />
                  </span>
                ))}
              </span>
            </span>
          ))}
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="font-medium text-heading">
            {into ? `Import into ${into.name}` : 'Drop to import'}
          </span>
          <span className="text-dim">Bank statements in CSV or Excel</span>
        </div>
      </div>
    </div>
  )
}

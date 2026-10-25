import type { Hue } from './hues'

const rows: readonly Hue[] = ['lime', 'orange', 'blue', 'rose', 'teal']

const sizes = {
  sm: 'h-11 w-9 p-1.5 **:data-row:gap-1 **:data-tile:size-1 **:data-line:h-0.5 **:data-beam:h-0.5',
  lg: 'h-30 w-24 p-3 **:data-row:gap-2 **:data-tile:size-3.5 **:data-line:h-1 **:data-beam:h-1',
}

export function Scan({ size = 'sm' }: { size?: keyof typeof sizes }) {
  return (
    <span
      aria-hidden="true"
      className={`scan relative block shrink-0 overflow-hidden rounded-control border border-line bg-surface ${sizes[size]}`}
    >
      <span className="flex h-full flex-col justify-between">
        {rows.map((hue) => (
          <span key={hue} data-row className="flex items-center">
            <span data-hue={hue} data-tile className="relative shrink-0 rounded-tile bg-fill">
              <span data-ink className="absolute inset-0 rounded-tile bg-tile-solid" />
            </span>
            <span data-hue={hue} data-line className="flex-1 rounded-chip bg-fill" />
          </span>
        ))}
      </span>
      <span data-beam data-hue="gray" className="absolute inset-x-0 top-0 bg-tile-solid" />
    </span>
  )
}

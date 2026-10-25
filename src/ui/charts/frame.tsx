import type { ReactElement, ReactNode } from 'react'
import { ResponsiveContainer, type TooltipContentProps } from 'recharts'

export type Series = { key: string; label: string }

export type Format = (value: number) => ReactNode

const shades = [100, 45, 25, 12, 6]

export const tint = (index: number) =>
  `color-mix(in srgb, var(--color-ink) ${shades.at(index % shades.length)}%, transparent)`

function Swatch({ color }: { color: string }) {
  return (
    <svg width={8} height={8} aria-hidden="true" className="shrink-0">
      <rect width={8} height={8} rx={2} fill={color} />
    </svg>
  )
}

export type Item = { key: string; name: ReactNode; value: number; color: string }

type TipProps = { label: ReactNode; items: readonly Item[]; format: Format }

export function Rows({ label, items, format }: TipProps) {
  return (
    <>
      {label !== undefined && <span className="text-dim">{label}</span>}
      {items.map(({ key, name, value, color }) => (
        <span key={key} className="flex items-center gap-2">
          <Swatch color={color} />
          <span className="text-dim">{name}</span>
          <span className="ml-auto pl-4 font-medium">{format(value)}</span>
        </span>
      ))}
    </>
  )
}

export function Tip(props: TipProps) {
  return (
    <div className="flex min-w-32 flex-col gap-1.5 rounded-control border border-line bg-surface px-2.5 py-2 text-caption shadow-popover">
      <Rows {...props} />
    </div>
  )
}

type ReadoutProps = Pick<TooltipContentProps, 'active' | 'label' | 'payload'> & { format: Format }

export function Readout({ active, label, payload, format }: ReadoutProps) {
  if (!active || !payload.length) return null
  return (
    <Tip
      label={label}
      format={format}
      items={payload.map(({ dataKey, name, value, color, payload: row }) => ({
        key: String(dataKey ?? name),
        name,
        value: Number(value),
        color: row?.fill ?? color ?? tint(0),
      }))}
    />
  )
}

type LegendProps = {
  items: readonly Series[]
  selected?: string | undefined
  onSelect?: (key: string | undefined) => void
}

export function Legend({ items, selected, onSelect }: LegendProps) {
  return (
    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-caption">
      {items.map(({ key, label }, index) => (
        <button
          key={key}
          type="button"
          disabled={!onSelect}
          onClick={() => onSelect?.(selected === key ? undefined : key)}
          className={`flex items-center gap-1.5 transition ${selected && selected !== key ? 'text-dim' : ''}`}
        >
          <Swatch color={tint(index)} />
          {label}
        </button>
      ))}
    </div>
  )
}

type FrameProps = { legend?: ReactNode; bleed?: boolean; fit?: boolean; children: ReactElement }

export function Frame({ legend, bleed, fit, children }: FrameProps) {
  return (
    <div
      className={`chart flex flex-col gap-3 ${fit ? 'min-h-0 flex-1' : 'h-64'} ${bleed ? '-mr-3 -mb-3' : ''}`}
    >
      {legend}
      <div className="min-h-0 flex-1 motion-safe:animate-reveal">
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

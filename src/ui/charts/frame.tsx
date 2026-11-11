import type { ReactElement, ReactNode } from 'react'
import { ResponsiveContainer, type TooltipContentProps } from 'recharts'

export type Format = (value: number) => ReactNode

const shades = [100, 45]

export const tint = (index: number) =>
  `color-mix(in srgb, var(--color-ink) ${shades[index]}%, transparent)`

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
      items={payload.map(({ dataKey, name, value, color }) => ({
        key: String(dataKey ?? name),
        name,
        value: Number(value),
        color: color ?? tint(0),
      }))}
    />
  )
}

type FrameProps = { bleed?: boolean; fit?: boolean; children: ReactElement }

export function Frame({ bleed, fit, children }: FrameProps) {
  return (
    <div
      className={`chart flex flex-col ${fit ? 'min-h-0 flex-1' : 'h-64'} ${bleed ? '-mr-3 -mb-3' : ''}`}
    >
      <div className="min-h-0 flex-1 motion-safe:animate-reveal">
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

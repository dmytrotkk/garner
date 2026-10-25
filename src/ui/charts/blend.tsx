import { useId } from 'react'
import { Bar, BarChart, type BarShapeProps, Tooltip, XAxis, YAxis } from 'recharts'
import { color, type Hue, hues } from '../hues'
import { type Format, Frame, Tip } from './frame'

export type Slice = { key: string; label: string; hue: Hue; value: number }

type Column = { label: string; slices: readonly Slice[] }

type Props = { columns: readonly Column[]; format: Format; fit?: boolean; bleed?: boolean }

const radius = 6

const seam = 0.4

const sum = (slices: readonly Slice[]) => slices.reduce((total, { value }) => total + value, 0)

const ordered = (slices: readonly Slice[]) =>
  [...slices].sort((a, b) => hues.indexOf(a.hue) - hues.indexOf(b.hue))

function stops(slices: readonly Slice[]) {
  const total = sum(slices)
  const shares = slices.map(({ value }) => value / total)
  const seams = shares.map((share, index) => Math.min(share, shares[index + 1] ?? 0) * seam)
  let start = 0
  return slices.flatMap(({ key, hue }, index) => {
    const end = start + (shares[index] ?? 0)
    const band = { from: start + (seams[index - 1] ?? 0), to: end - (seams[index] ?? 0) }
    start = end
    return [
      { key: `${key}-from`, offset: band.from, color: color(hue) },
      { key: `${key}-to`, offset: band.to, color: color(hue) },
    ]
  })
}

export function BlendChart({ columns, format, fit = false, bleed = false }: Props) {
  const id = useId()
  const data = columns.map((column) => ({ ...column, total: sum(column.slices) }))
  return (
    <Frame fit={fit} bleed={bleed}>
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis hide />
        <Tooltip
          cursor={false}
          content={({ active, label, payload }) => {
            const slices: readonly Slice[] | undefined = payload[0]?.payload?.slices
            return (
              active &&
              slices && (
                <Tip
                  label={label}
                  format={format}
                  items={[...slices]
                    .sort((a, b) => b.value - a.value)
                    .map(({ key, label, hue, value }) => ({
                      key,
                      name: label,
                      value,
                      color: color(hue),
                    }))}
                />
              )
            )
          }}
        />
        <Bar
          dataKey="total"
          maxBarSize={32}
          isAnimationActive={false}
          shape={({ x, y, width, height, index, payload }: BarShapeProps) => {
            return (
              <g>
                <defs>
                  <linearGradient id={`${id}${index}`} x1={0} y1={1} x2={0} y2={0}>
                    {stops(ordered(payload.slices)).map(({ key, offset, color }) => (
                      <stop key={key} offset={offset} stopColor={color} />
                    ))}
                  </linearGradient>
                </defs>
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  rx={Math.min(radius, width / 2, height / 2)}
                  fill={`url(#${id}${index})`}
                />
              </g>
            )
          }}
        />
      </BarChart>
    </Frame>
  )
}

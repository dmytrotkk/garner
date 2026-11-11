import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { date } from '../../core/format.ts'
import { type Format, Frame, Readout, tint } from './frame.tsx'

type Props<Row> = {
  data: readonly Row[]
  x: keyof Row & string
  y: keyof Row & string
  label: string
  format: Format
  scale?: ((value: number, step: number) => string) | undefined
}

const gap = 6
const rows = 60

const months = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const years = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'UTC' })
const days = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function marks(times: readonly number[]) {
  const first = times[0] ?? 0
  const inner = times.filter((time) => time - first > ((times.at(-1) ?? 0) - first) / 20)
  const starts = inner.filter((time) => new Date(time).getUTCDate() === 1)
  if (starts.length < 2)
    return {
      ticks: inner.filter((_, index) => index % Math.ceil(inner.length / 4) === 0),
      label: (time: number) => days.format(time),
    }
  const step = [1, 2, 3, 6, 12, 24, 60, 120].find((size) => starts.length / size <= 5) ?? 120
  return {
    ticks: starts.filter((time) => {
      const at = new Date(time)
      return (at.getUTCFullYear() * 12 + at.getUTCMonth()) % step === 0
    }),
    label: (time: number) => (new Date(time).getUTCMonth() ? months : years).format(time),
  }
}

function Texture({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} width={gap * 2} height={rows * gap} patternUnits="userSpaceOnUse">
      {Array.from({ length: rows * 2 }, (_, index) => {
        const row = Math.floor(index / 2)
        const shifted = index % 2
        return (
          <circle
            key={`${row} ${shifted}`}
            cx={gap / 2 + shifted * gap}
            cy={row * gap + (shifted ? gap : gap / 2)}
            r={1 - 0.8 * (row / rows)}
            fill={color}
          />
        )
      })}
    </pattern>
  )
}

export function LineChart<Row extends Record<string, unknown>>({
  data,
  x,
  y,
  label,
  format,
  scale,
}: Props<Row>) {
  const id = useId()
  const color = tint(0)
  const { ticks, label: mark } = marks(data.map((row) => Number(row[x])))
  const values = data.map((row) => Number(row[y]))
  const [low, high] = [Math.min(...values), Math.max(...values)]
  const step = (high - low) / 3

  return (
    <Frame bleed>
      <AreaChart data={[...data]} margin={{ top: 8, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <Texture id={id} color={color} />
        </defs>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="1 4" />
        <XAxis
          dataKey={x as string}
          type="number"
          domain={['dataMin', 'dataMax']}
          ticks={ticks}
          interval={0}
          tickFormatter={mark}
          axisLine={false}
          tickLine={false}
          height={16}
          tickSize={0}
          tickMargin={6}
        />
        <YAxis
          domain={['auto', 'auto']}
          tickCount={4}
          {...(scale && scale(low, step) !== scale(high, step)
            ? { tickFormatter: (value: number) => scale(value, step) }
            : { tick: false })}
          orientation="right"
          width="auto"
          tickSize={0}
          tickMargin={6}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={({ label: time, ...props }) => (
            <Readout
              {...props}
              {...(time !== undefined && { label: date(Number(time)) })}
              format={format}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey={y as string}
          name={label}
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${id})`}
          fillOpacity={1}
          activeDot={{ r: 3, fill: color, stroke: 'none' }}
          isAnimationActive={false}
        />
      </AreaChart>
    </Frame>
  )
}

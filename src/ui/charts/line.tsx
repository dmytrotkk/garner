import { useId, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { date } from '../../core/format'
import { type Format, Frame, Legend, Readout, type Series, tint } from './frame'

type Fill = 'dotted' | 'hatched'

type Props<Row> = {
  data: readonly Row[]
  x: keyof Row & string
  series: readonly Series[]
  format: Format
  scale?: ((value: number, step: number) => string) | undefined
  fill?: Fill
  stacked?: boolean
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

function Texture({ id, fill, color }: { id: string; fill: Fill; color: string }) {
  if (fill === 'hatched')
    return (
      <pattern
        id={id}
        width={gap}
        height={gap}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line x1={0} y1={0} x2={0} y2={gap} stroke={color} strokeOpacity={0.3} />
      </pattern>
    )
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
  series,
  format,
  scale,
  fill,
  stacked,
}: Props<Row>) {
  const id = useId()
  const [selected, setSelected] = useState<string>()
  const { ticks, label } = marks(data.map((row) => Number(row[x])))
  const levels = data.map((row) => series.map(({ key }) => Number(row[key])))
  const plotted = stacked
    ? [0, ...levels.map((row) => row.reduce((sum, value) => sum + value, 0))]
    : levels.flat()
  const [low, high] = [Math.min(...plotted), Math.max(...plotted)]
  const step = (high - low) / 3

  return (
    <Frame
      bleed
      legend={
        series.length > 1 && <Legend items={series} selected={selected} onSelect={setSelected} />
      }
    >
      <AreaChart data={[...data]} margin={{ top: 8, right: 2, bottom: 2, left: 2 }}>
        <defs>
          {fill &&
            series.map(({ key }, index) => (
              <Texture key={key} id={`${id}${key}`} fill={fill} color={tint(index)} />
            ))}
        </defs>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="1 4" />
        <XAxis
          dataKey={x as string}
          type="number"
          domain={['dataMin', 'dataMax']}
          ticks={ticks}
          interval={0}
          tickFormatter={label}
          axisLine={false}
          tickLine={false}
          height={16}
          tickSize={0}
          tickMargin={6}
        />
        <YAxis
          domain={stacked ? [0, 'auto'] : ['auto', 'auto']}
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
        {series.map(({ key, label }, index) => {
          const color = tint(index)
          const dimmed = selected !== undefined && selected !== key
          return (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              name={label}
              stroke={color}
              strokeWidth={1.5}
              strokeOpacity={dimmed ? 0.2 : 1}
              fill={fill ? `url(#${id}${key})` : 'none'}
              fillOpacity={dimmed ? 0.2 : 1}
              activeDot={{ r: 3, fill: color, stroke: 'none' }}
              isAnimationActive={false}
              {...(stacked && { stackId: 'stack' })}
            />
          )
        })}
      </AreaChart>
    </Frame>
  )
}

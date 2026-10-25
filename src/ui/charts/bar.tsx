import { Bar, type BarShapeProps, BarChart as Bars, Tooltip, XAxis, YAxis } from 'recharts'
import { type Format, Frame, Legend, Readout, type Series, tint } from './frame'

type Props<Row> = {
  data: readonly Row[]
  x: keyof Row & string
  series: readonly Series[]
  format: Format
  duotone?: boolean
  stacked?: boolean
}

const radius = 4

function Duotone({ x, y, width, height, fill }: BarShapeProps) {
  const top = Math.min(y, y + height)
  const bottom = Math.max(y, y + height)
  const middle = x + width / 2
  const right = x + width
  const r = Math.min(radius, width / 2, (bottom - top) / 2)
  return (
    <>
      <path
        d={`M${middle},${top} H${x + r} A${r},${r} 0 0 0 ${x},${top + r} V${bottom - r} A${r},${r} 0 0 0 ${x + r},${bottom} H${middle} Z`}
        fill={fill}
        fillOpacity={0.4}
      />
      <path
        d={`M${middle},${top} H${right - r} A${r},${r} 0 0 1 ${right},${top + r} V${bottom - r} A${r},${r} 0 0 1 ${right - r},${bottom} H${middle} Z`}
        fill={fill}
      />
    </>
  )
}

export function BarChart<Row extends Record<string, unknown>>({
  data,
  x,
  series,
  format,
  duotone,
  stacked,
}: Props<Row>) {
  return (
    <Frame legend={series.length > 1 && <Legend items={series} />}>
      <Bars data={[...data]} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
        <XAxis dataKey={x as string} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis hide />
        <Tooltip cursor={false} content={(props) => <Readout {...props} format={format} />} />
        {series.map(({ key, label }, index) => (
          <Bar
            key={key}
            dataKey={key}
            name={label}
            fill={tint(index)}
            radius={radius}
            isAnimationActive={false}
            {...(duotone && { shape: Duotone })}
            {...(stacked && { stackId: 'stack' })}
          />
        ))}
      </Bars>
    </Frame>
  )
}

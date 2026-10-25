import { Pie, PieChart, Tooltip } from 'recharts'
import { type Format, Frame, Legend, Readout, tint } from './frame'

type Slice = { key: string; label: string; value: number }

export function DonutChart({ slices, format }: { slices: readonly Slice[]; format: Format }) {
  return (
    <Frame legend={<Legend items={slices} />}>
      <PieChart>
        <Tooltip content={(props) => <Readout {...props} format={format} />} />
        <Pie
          data={slices.map((slice, index) => ({ ...slice, fill: tint(index) }))}
          dataKey="value"
          nameKey="label"
          innerRadius="64%"
          outerRadius="100%"
          paddingAngle={2}
          cornerRadius={4}
          stroke="none"
          isAnimationActive={false}
        />
      </PieChart>
    </Frame>
  )
}

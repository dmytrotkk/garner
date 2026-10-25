import type { ReactNode } from 'react'
import type { history } from '../data/history'
import { Card } from '../ui/card'
import { LineChart } from '../ui/charts/line'
import { Stat } from '../ui/page'
import { Money, useScale } from './-money'

type Props = {
  label: string
  value: number
  history: Awaited<ReturnType<typeof history>>
  action?: ReactNode
  children?: ReactNode
}

const series = [{ key: 'value', label: 'Value' }]

export function History({ label, value, history: { currency, points }, action, children }: Props) {
  const scale = useScale(currency)
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <Stat label={label} value={<Money value={value} />} />
        {action}
      </div>
      {children ??
        (points.length > 1 && (
          <LineChart
            data={points.map(({ day, value }) => ({ time: Date.parse(day), value }))}
            x="time"
            series={series}
            fill="dotted"
            format={(amount) => <Money value={{ amount, currency }} />}
            scale={scale}
          />
        ))}
    </Card>
  )
}

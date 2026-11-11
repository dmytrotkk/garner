import type { ReactNode } from 'react'
import type { history } from '../data/history.ts'
import { Card } from '../ui/card.tsx'
import { LineChart } from '../ui/charts/line.tsx'
import { Stat } from '../ui/page.tsx'
import { Money, useScale } from './-money.tsx'

type Props = {
  label: string
  value: number
  history: Awaited<ReturnType<typeof history>>
  action?: ReactNode
  children?: ReactNode
}

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
            y="value"
            label="Value"
            format={(amount) => <Money value={{ amount, currency }} />}
            scale={scale}
          />
        ))}
    </Card>
  )
}

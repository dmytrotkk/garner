import { Input as Base } from '@base-ui/react/input'
import { useLayoutEffect, useRef, useState } from 'react'

type Props = {
  name: string
  initial?: string | undefined
  suffix?: string | undefined
  placeholder: string
}

const digit = /[\d.]/

const clean = (text: string) => {
  const kept = text.replace(/[^\d.]/g, '')
  const dot = kept.indexOf('.')
  return dot === -1 ? kept : `${kept.slice(0, dot + 1)}${kept.slice(dot + 1).replaceAll('.', '')}`
}

const grouped = (raw: string) => {
  const [whole = '', fraction] = raw.split('.')
  const int = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction === undefined ? int : `${int}.${fraction}`
}

export function AmountInput({ name, initial = '', suffix, placeholder }: Props) {
  const [raw, setRaw] = useState(clean(initial))
  const input = useRef<HTMLInputElement>(null)
  const after = useRef<number>(undefined)
  const shown = grouped(raw)

  useLayoutEffect(() => {
    const el = input.current
    if (!el || after.current === undefined) return
    let pos = shown.length
    let left = after.current
    while (left > 0 && pos > 0) {
      pos--
      if (digit.test(shown[pos] ?? '')) left--
    }
    el.setSelectionRange(pos, pos)
    after.current = undefined
  })

  return (
    <span className="relative flex items-center">
      <Base
        ref={input}
        value={shown}
        placeholder={placeholder}
        inputMode="decimal"
        autoComplete="off"
        onChange={(event) => {
          const { value, selectionStart } = event.currentTarget
          after.current = clean(value.slice(selectionStart ?? value.length)).length
          setRaw(clean(value))
        }}
        className="h-12 w-full rounded-control border border-line bg-field px-3 text-title transition placeholder:text-dim data-invalid:border-negative"
      />
      {suffix && <span className="absolute right-3 text-dim text-nav">{suffix}</span>}
      <input type="hidden" name={name} value={raw} />
    </span>
  )
}

import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Button } from './button.tsx'
import { Icon } from './icon.tsx'

type Props = { text: string; label: string; variant?: 'ghost' | 'secondary' }

export function Copy({ text, label, variant = 'ghost' }: Props) {
  const [state, setState] = useState<'idle' | 'copied'>('idle')
  const button = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = (next: 'idle' | 'copied') => {
    const node = button.current
    if (!node || variant !== 'secondary') return setState(next)
    const from = `${node.offsetWidth}px`
    flushSync(() => setState(next))
    node.style.width = ''
    const to = `${node.offsetWidth}px`
    node.style.width = from
    node.getBoundingClientRect()
    node.style.width = to
    node.addEventListener('transitionend', () => node.style.removeProperty('width'), { once: true })
  }
  const copied = state === 'copied'
  return (
    <Button
      ref={button}
      variant={variant}
      size="sm"
      fluid={variant === 'secondary'}
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        show('copied')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => show('idle'), 1500)
      }}
    >
      <Icon icon={copied ? Tick02Icon : Copy01Icon} />
      {variant === 'secondary' && (copied ? 'Copied' : label)}
    </Button>
  )
}

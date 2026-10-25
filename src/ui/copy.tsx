import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from './button'
import { Icon } from './icon'

type Props = { text: string; label: string; variant?: 'ghost' | 'secondary' }

export function Copy({ text, label, variant = 'ghost' }: Props) {
  const [state, setState] = useState<'idle' | 'copied'>('idle')
  const button = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = (next: 'idle' | 'copied') => {
    const node = button.current
    if (node && variant === 'secondary') node.style.width = `${node.offsetWidth}px`
    setState(next)
  }
  useLayoutEffect(() => {
    const node = button.current
    if (!node?.style.width) return
    const from = node.style.width
    node.style.width = ''
    const to = `${node.offsetWidth}px`
    node.style.width = from
    node.getBoundingClientRect()
    node.style.width = to
    const settle = () => {
      node.style.width = ''
    }
    node.addEventListener('transitionend', settle, { once: true })
    return () => node.removeEventListener('transitionend', settle)
  }, [state])
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

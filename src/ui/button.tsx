import { Button as Base } from '@base-ui/react/button'

const variants = {
  primary: 'bg-ink font-medium text-surface hover:bg-ink/85',
  secondary: 'border border-line bg-surface font-medium text-ink hover:bg-fill',
  ghost: 'font-normal text-dim hover:bg-fill hover:text-ink',
}

const sizes = { sm: 'h-7 px-2.5', md: 'h-8 px-3' }

type Props = Omit<Base.Props, 'className' | 'style'> & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  fluid?: boolean
}

export function Button({ variant = 'primary', size = 'md', fluid = false, ...props }: Props) {
  return (
    <Base
      {...props}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control transition data-disabled:pointer-events-none data-disabled:opacity-50 motion-safe:active:scale-97 **:data-icon:size-3.5 ${variants[variant]} ${sizes[size]} ${fluid ? 'fluid' : ''}`}
    />
  )
}

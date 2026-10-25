import { Input as Base } from '@base-ui/react/input'

export const field =
  'h-10 w-full rounded-control border border-line bg-field px-3 text-nav transition placeholder:text-dim'

export function Input(props: Omit<Base.Props, 'className' | 'style'>) {
  return <Base {...props} className={`${field} data-invalid:border-negative`} />
}

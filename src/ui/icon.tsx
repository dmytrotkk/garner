import { createElement } from 'react'

export type IconSvgElement = readonly (readonly [
  string,
  Readonly<Record<string, string | number>>,
])[]

type Props = { icon: IconSvgElement; stroke?: number }

export function Icon({ icon, stroke = 2 }: Props) {
  return (
    <svg data-icon viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4 shrink-0">
      {icon.map(([tag, attrs]) =>
        createElement(tag, { ...attrs, stroke: 'currentColor', strokeWidth: stroke }),
      )}
    </svg>
  )
}

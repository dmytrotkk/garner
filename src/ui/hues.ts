export const hues = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'mint',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'pink',
  'rose',
  'brown',
  'brass',
  'gray',
] as const

export type Hue = (typeof hues)[number]

export const color = (hue: Hue) => `var(--hue-${hue})`

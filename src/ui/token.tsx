import { useEffect, useRef, useState } from 'react'
import { type Column, Label } from './table'

const sizes = { md: { box: 'size-5', inset: 2 }, lg: { box: 'size-7', inset: 3 } }

type Source = (id: string) => Promise<string | null>

const images = new Map<string, Promise<HTMLImageElement>>()
let source: Source = async () => null

export function provideIcons(resolve: Source) {
  source = resolve
}

function load(id: string) {
  const cached = images.get(id)
  if (cached) return cached
  const loaded = source(id).then(
    (url) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        if (!url) return reject(new Error(`no icon for ${id}`))
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = url
      }),
  )
  images.set(id, loaded)
  loaded.catch(() => images.delete(id))
  return loaded
}

const spots = [
  [0.5, 0.06],
  [0.5, 0.94],
  [0.06, 0.5],
  [0.94, 0.5],
  [0.19, 0.19],
  [0.81, 0.19],
  [0.19, 0.81],
  [0.81, 0.81],
] as const

const alike = (a: number[], b: number[]) =>
  a.every((value, i) => Math.abs(value - (b[i] ?? 0)) < 16)

function edge(context: CanvasRenderingContext2D, size: number) {
  const pixels = spots
    .map(([x, y]) => [...context.getImageData(x * size, y * size, 1, 1).data])
    .filter(([, , , alpha = 0]) => alpha > 250)
  const fill = pixels.find((pixel) => pixels.filter((other) => alike(pixel, other)).length > 4)
  return fill && `rgb(${fill[0]} ${fill[1]} ${fill[2]})`
}

function paint(canvas: HTMLCanvasElement, image: HTMLImageElement, inset: number) {
  const size = Math.round(canvas.clientWidth * devicePixelRatio)
  const pad = inset * devicePixelRatio
  const context = canvas.getContext('2d')
  if (!context) return
  canvas.width = size
  canvas.height = size
  context.drawImage(image, 0, 0, size, size)
  const fill = edge(context, size)
  context.clearRect(0, 0, size, size)
  if (fill) {
    context.fillStyle = fill
    context.fillRect(0, 0, size, size)
  }
  context.drawImage(image, pad, pad, size - 2 * pad, size - 2 * pad)
}

type Props = { id: string; symbol: string; size?: keyof typeof sizes }

const flags = import.meta.glob<string>('./flags/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

export function TokenIcon({ id, symbol, size = 'md' }: Props) {
  const [missing, setMissing] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const { box, inset } = sizes[size]
  const flag = id.startsWith('fiat:') && flags[`./flags/${id.slice(5).toLowerCase()}.svg`]

  useEffect(() => {
    const target = canvas.current
    if (target)
      load(id).then(
        (image) => paint(target, image, inset),
        () => setMissing(true),
      )
  }, [id, inset])

  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-control bg-fill font-medium text-caption text-dim`}
    >
      {flag ? (
        <img src={flag} alt="" className="size-full" />
      ) : missing ? (
        symbol.slice(0, 1)
      ) : (
        <canvas ref={canvas} aria-hidden className="size-full" />
      )}
    </span>
  )
}

export const asset: Column<{ id: string; symbol: string; name: string }> = {
  header: 'Asset',
  cell: ({ id, symbol, name }) => (
    <span className="flex items-center gap-2">
      <TokenIcon id={id} symbol={symbol} />
      <Label text={symbol} note={name} />
    </span>
  ),
}

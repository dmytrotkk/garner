import { MeshGradient } from '@paper-design/shaders-react'
import type { PointerEvent, ReactNode } from 'react'
import { Glyph } from './glyph.tsx'
import { type Hue, hues } from './hues.ts'

type Spot = { hue: Hue; value: number }

type Face = { glyph: Glyph; balance: ReactNode }

type Props = { slices: readonly Spot[]; name: string; face?: Face }

const spots = 10

const seed = (text: string) =>
  [...text].reduce((hash, char) => (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0, 7)

const least = 0.05

const drift = 0.2

function rgb(hue: Hue) {
  const pixel = new OffscreenCanvas(1, 1).getContext('2d')
  if (!pixel) return '#000'
  pixel.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(`--hue-${hue}`)
  pixel.fillRect(0, 0, 1, 1)
  const [r, g, b] = pixel.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

const sum = (slices: readonly Spot[]) => slices.reduce((total, { value }) => total + value, 0)

function colors(slices: readonly Spot[]) {
  const kept = [...slices]
    .sort((a, b) => b.value - a.value)
    .filter(({ value }, index) => !index || value / sum(slices) >= least)
  const counted = kept.map(({ hue, value }) => ({ hue, share: (value / sum(kept)) * spots }))
  const short = spots - counted.reduce((total, { share }) => total + Math.floor(share), 0)
  const extra = new Set([...counted].sort((a, b) => (b.share % 1) - (a.share % 1)).slice(0, short))
  return counted
    .sort((a, b) => hues.indexOf(a.hue) - hues.indexOf(b.hue))
    .flatMap((spot) =>
      Array<string>(Math.floor(spot.share) + (extra.has(spot) ? 1 : 0)).fill(rgb(spot.hue)),
    )
}

function follow({ currentTarget, clientX, clientY }: PointerEvent<HTMLElement>) {
  const box = currentTarget.getBoundingClientRect()
  currentTarget.style.setProperty('--x', String((clientX - box.left) / box.width))
  currentTarget.style.setProperty('--y', String((clientY - box.top) / box.height))
}

function settle({ currentTarget }: PointerEvent<HTMLElement>) {
  currentTarget.style.removeProperty('--x')
  currentTarget.style.removeProperty('--y')
}

export function MeshCard({ slices, name, face }: Props) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <div
      onPointerMove={follow}
      onPointerLeave={settle}
      className="group relative isolate flex aspect-8/5 flex-col justify-between overflow-hidden rounded-surface border border-line bg-surface p-5 motion-safe:tilt"
    >
      <MeshGradient
        colors={colors(slices)}
        distortion={0.8}
        swirl={0.1}
        speed={still ? 0 : drift}
        frame={seed(name) % 60_000}
        rotation={seed(name) % 360}
        className="absolute inset-0 -z-10 clip-surface"
      />
      {face && (
        <>
          <div className="flex items-start justify-between">
            <span className="etched **:data-icon:size-8 **:data-icon:text-heading">
              <Glyph glyph={face.glyph} />
            </span>
            <span className="etched text-heading">{face.balance}</span>
          </div>
          <span className="etched self-start text-heading">{name}</span>
        </>
      )}
      <span className="glare clip-surface pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100 in-data-menu-open:opacity-100" />
    </div>
  )
}

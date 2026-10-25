import { Tooltip as Base } from '@base-ui/react/tooltip'
import { type Dispatch, type SetStateAction, useLayoutEffect, useRef, useState } from 'react'
import { percent } from '../../core/format'
import { color, type Hue } from '../hues'
import { Tooltip } from '../tooltip'
import { type Format, type Item, Rows, tint } from './frame'

export type Node = { key: string; label: string; hue: Hue | undefined; items?: readonly Item[] }

export type Link = { from: string; to: string; value: number }

export type Graph = { nodes: readonly Node[]; links: readonly Link[] }

type Props = Graph & { format: Format; compact: ((value: number) => string) | undefined }

type Side = 'source' | 'sink' | 'through'

type Placed = {
  node: Node
  side: Side
  fill: string
  value: number
  rows: readonly Item[]
  share: number
  x: number
  y: number
  width: number
  height: number
}

type Ribbon = {
  key: string
  from: string
  to: string
  label: string
  fill: string
  value: number
  sx: number
  sy: number
  tx: number
  ty: number
  width: number
}

type Edge = { a: number; b: number; value: number }

type Focus = { kind: 'none' } | { kind: 'node'; key: string } | { kind: 'ribbon'; key: string }

type Hover = { focus: Focus; set: Dispatch<SetStateAction<Focus>> }

type Size = { width: number; height: number }

type Scene = { nodes: readonly Placed[]; ribbons: readonly Ribbon[] }

const nodeWidth = 8
const padding = { leaf: 12, through: 28 }
const margin = { top: 8, right: 136, bottom: 20, left: 136 }
const sweeps = 3
const none: Focus = { kind: 'none' }

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

const cut = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name)

const path = ({ sx, sy, tx, ty, width }: Ribbon) => {
  const w = Math.max(width, 1) / 2
  const mid = (sx + tx) / 2
  return `M${sx},${sy - w}C${mid},${sy - w} ${mid},${ty - w} ${tx},${ty - w}L${tx},${ty + w}C${mid},${ty + w} ${mid},${sy + w} ${sx},${sy + w}Z`
}

const follow = (hover: Hover, focus: Exclude<Focus, { kind: 'none' }>) => (open: boolean) =>
  hover.set((prev) => (open ? focus : prev.kind !== 'none' && prev.key === focus.key ? none : prev))

const lit = (focus: Focus, ribbon: Ribbon) =>
  focus.kind === 'none'
    ? undefined
    : (
          focus.kind === 'ribbon'
            ? focus.key === ribbon.key
            : focus.key === ribbon.from || focus.key === ribbon.to
        )
      ? 'lit'
      : 'dim'

function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const { width, height } = el.getBoundingClientRect()
      const next = { width: Math.round(width), height: Math.round(height) }
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next))
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

function depths(count: number, edges: readonly Edge[]) {
  const depth = Array.from({ length: count }, () => 0)
  const left = Array.from({ length: count }, () => 0)
  for (const { b } of edges) left[b] = (left[b] ?? 0) + 1
  const queue = left.flatMap((pending, index) => (pending ? [] : [index]))
  for (let at = 0; at < queue.length; at++) {
    const index = queue[at]
    if (index === undefined) break
    for (const { a, b, value } of edges) {
      if (a !== index || !(value > 0)) continue
      depth[b] = Math.max(depth[b] ?? 0, (depth[a] ?? 0) + 1)
      left[b] = (left[b] ?? 1) - 1
      if (left[b] === 0) queue.push(b)
    }
  }
  return depth
}

function layout({ nodes, links }: Graph, size: Size): Scene {
  const index = new Map(nodes.map((node, at) => [node.key, at]))
  const edges = links.flatMap((link): Edge[] => {
    const a = index.get(link.from)
    const b = index.get(link.to)
    return a === undefined || b === undefined || a === b || !(link.value > 0)
      ? []
      : [{ a, b, value: link.value }]
  })
  const ins = nodes.map(() => 0)
  const outs = nodes.map(() => 0)
  for (const { a, b, value } of edges) {
    outs[a] = (outs[a] ?? 0) + value
    ins[b] = (ins[b] ?? 0) + value
  }
  const values = nodes.map((_, at) => Math.max(ins[at] ?? 0, outs[at] ?? 0))
  const side = (at: number): Side =>
    (ins[at] ?? 0) > 0 && (outs[at] ?? 0) > 0 ? 'through' : (ins[at] ?? 0) > 0 ? 'sink' : 'source'
  const depth = depths(nodes.length, edges)
  const deepest = Math.max(0, ...depth.filter((_, at) => (values[at] ?? 0) > 0))
  const column = (at: number) => (side(at) === 'sink' ? deepest : (depth[at] ?? 0))
  const plotWidth = size.width - margin.left - margin.right
  const plotHeight = size.height - margin.top - margin.bottom
  const columns = Array.from({ length: deepest + 1 }, (_, level) =>
    nodes.flatMap((_, at) => ((values[at] ?? 0) > 0 && column(at) === level ? [at] : [])),
  )
  const gap = (level: number) =>
    columns[level]?.some((at) => side(at) === 'through') ? padding.through : padding.leaf
  const scale = Math.min(
    ...columns.map(
      (members, level) =>
        (plotHeight - (members.length - 1) * gap(level)) /
        sum(members.map((at) => values[at] ?? 0)),
    ),
  )
  if (!(scale > 0) || !Number.isFinite(scale)) return { nodes: [], ribbons: [] }
  const top = nodes.map(() => 0)
  const height = values.map((value) => value * scale)
  const stack = (members: readonly number[], level: number) => {
    const tall = sum(members.map((at) => height[at] ?? 0)) + (members.length - 1) * gap(level)
    let y = margin.top + (plotHeight - tall) / 2
    for (const at of members) {
      top[at] = y
      y += (height[at] ?? 0) + gap(level)
    }
  }
  columns.forEach(stack)
  const middle = (at: number) => (top[at] ?? 0) + (height[at] ?? 0) / 2
  const pinned = (at: number) => nodes[at]?.hue === undefined && side(at) !== 'through'
  const key = (at: number, neighbours: readonly number[]) =>
    pinned(at)
      ? Number.POSITIVE_INFINITY
      : neighbours.length
        ? sum(neighbours.map(middle)) / neighbours.length
        : middle(at)
  const reorder = (level: number, forward: boolean) => {
    const members = columns[level]
    if (!members) return
    const ranked = members
      .map((at) => ({
        at,
        rank: key(
          at,
          edges.flatMap(({ a, b }) => (forward ? (b === at ? [a] : []) : a === at ? [b] : [])),
        ),
      }))
      .sort((p, q) => p.rank - q.rank)
      .map(({ at }) => at)
    columns[level] = ranked
    stack(ranked, level)
  }
  for (let sweep = 0; sweep < sweeps; sweep++) {
    for (let level = 1; level <= deepest; level++) reorder(level, true)
    for (let level = deepest - 1; level >= 0; level--) reorder(level, false)
  }
  const x = (at: number) =>
    margin.left +
    (deepest ? (column(at) * (plotWidth - nodeWidth)) / deepest : (plotWidth - nodeWidth) / 2)
  const fill = (at: number) => {
    const hue = nodes[at]?.hue
    return hue ? color(hue) : side(at) === 'through' ? tint(0) : tint(1)
  }
  const flow = (a: number, b: number) => {
    const hue = nodes[a]?.hue ?? nodes[b]?.hue
    return hue
      ? color(hue)
      : side(a) === 'through' && side(b) === 'through'
        ? color('brass')
        : tint(1)
  }
  const totals = { source: 0, sink: 0, through: 0 }
  for (const at of columns.flat()) totals[side(at)] += values[at] ?? 0
  const offsets = { out: nodes.map(() => 0), in: nodes.map(() => 0) }
  const ribbons = edges
    .toSorted((p, q) => middle(p.b) - middle(q.b) || middle(p.a) - middle(q.a))
    .map(({ a, b, value }): Ribbon => {
      const width = value * scale
      const sy = (top[a] ?? 0) + (offsets.out[a] ?? 0) + width / 2
      offsets.out[a] = (offsets.out[a] ?? 0) + width
      return {
        key: `${nodes[a]?.key} ${nodes[b]?.key}`,
        from: nodes[a]?.key ?? '',
        to: nodes[b]?.key ?? '',
        label: `${nodes[a]?.label} to ${nodes[b]?.label}`,
        fill: flow(a, b),
        value,
        sx: x(a) + nodeWidth,
        sy,
        tx: x(b),
        ty: 0,
        width,
      }
    })
  for (const ribbon of ribbons.toSorted((p, q) => p.sy - q.sy)) {
    const b = index.get(ribbon.to) ?? 0
    ribbon.ty = (top[b] ?? 0) + (offsets.in[b] ?? 0) + ribbon.width / 2
    offsets.in[b] = (offsets.in[b] ?? 0) + ribbon.width
  }
  const placed = columns.flat().map((at): Placed => {
    const node = nodes[at] ?? { key: '', label: '', hue: undefined }
    const kind = side(at)
    const value = values[at] ?? 0
    const across = ribbons.filter((ribbon) =>
      kind === 'sink' ? ribbon.to === node.key : ribbon.from === node.key,
    )
    const rows: readonly Item[] =
      node.items ??
      (kind === 'through'
        ? [
            { key: 'in', name: 'In', value: ins[at] ?? 0, color: tint(1) },
            { key: 'out', name: 'Out', value: outs[at] ?? 0, color: tint(1) },
          ]
        : across.length > 1
          ? across.map((ribbon) => {
              const other = index.get(kind === 'sink' ? ribbon.from : ribbon.to) ?? 0
              return {
                key: ribbon.key,
                name: nodes[other]?.label ?? '',
                value: ribbon.value,
                color: ribbon.fill,
              }
            })
          : [{ key: node.key, name: node.label, value, color: fill(at) }])
    return {
      node,
      side: kind,
      fill: fill(at),
      value,
      rows,
      share: totals[kind] ? value / totals[kind] : 0,
      x: x(at),
      y: top[at] ?? 0,
      width: nodeWidth,
      height: height[at] ?? 0,
    }
  })
  return { nodes: placed, ribbons }
}

type MarkProps = { hover: Hover; format: Format }

function RibbonMark({ ribbon, hover, format }: MarkProps & { ribbon: Ribbon }) {
  const state = lit(hover.focus, ribbon)
  return (
    <Tooltip
      onOpenChange={follow(hover, { kind: 'ribbon', key: ribbon.key })}
      label={
        <div className="flex min-w-32 flex-col gap-1.5 py-1">
          <Rows
            label={ribbon.label}
            items={[
              { key: ribbon.key, name: ribbon.label, value: ribbon.value, color: ribbon.fill },
            ]}
            format={format}
          />
        </div>
      }
    >
      <path
        d={path(ribbon)}
        fill={ribbon.fill}
        fillOpacity={state === 'lit' ? 0.65 : state === 'dim' ? 0.12 : 0.35}
        className="cursor-default transition-all"
      />
    </Tooltip>
  )
}

function NodeMark({
  placed,
  hover,
  format,
  compact,
}: MarkProps & { placed: Placed; compact: Props['compact'] }) {
  const { node, side, fill, value, rows, share, x, y, width, height } = placed
  const drawn = Math.max(height, 2)
  const middle = y + height / 2
  const hovered = hover.focus.kind === 'node' && hover.focus.key === node.key
  return (
    <g>
      <Tooltip
        onOpenChange={follow(hover, { kind: 'node', key: node.key })}
        label={
          <div className="flex min-w-32 flex-col gap-1.5 py-1">
            <Rows
              label={
                side === 'through'
                  ? node.label
                  : `${percent(share)} of ${side === 'source' ? 'in' : 'out'}`
              }
              items={rows}
              format={format}
            />
          </div>
        }
      >
        <rect
          x={x}
          y={middle - drawn / 2}
          width={width}
          height={drawn}
          fill={fill}
          className="cursor-default"
        />
      </Tooltip>
      {side === 'through' ? (
        <text
          x={x + width / 2}
          y={y + height + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          paintOrder="stroke"
          strokeWidth={3}
          className={`fill-dim stroke-surface text-caption ${hovered ? 'font-medium' : ''}`}
        >
          {node.label}
        </text>
      ) : (
        height >= 4 && (
          <text
            x={side === 'source' ? x - 8 : x + width + 8}
            y={middle}
            textAnchor={side === 'source' ? 'end' : 'start'}
            dominantBaseline="middle"
            className={`text-caption ${hovered ? 'font-medium' : ''}`}
          >
            <tspan className="fill-ink">{cut(node.label)}</tspan>
            {compact && (
              <tspan className="fill-dim" dx={6}>
                {compact(value)}
              </tspan>
            )}
          </text>
        )
      )}
    </g>
  )
}

export function SankeyChart({ nodes, links, format, compact }: Props) {
  const [ref, size] = useSize()
  const [focus, setFocus] = useState<Focus>(none)
  const hover = { focus, set: setFocus }
  const scene = size.width > 0 && size.height > 0 ? layout({ nodes, links }, size) : undefined
  return (
    <div ref={ref} className="chart size-full motion-safe:animate-reveal">
      {scene && (
        <Base.Provider delay={0} closeDelay={0}>
          <svg width={size.width} height={size.height} role="img" aria-label="Money flow">
            {scene.ribbons.map((ribbon) => (
              <RibbonMark key={ribbon.key} ribbon={ribbon} hover={hover} format={format} />
            ))}
            {scene.nodes.map((placed) => (
              <NodeMark
                key={placed.node.key}
                placed={placed}
                hover={hover}
                format={format}
                compact={compact}
              />
            ))}
          </svg>
        </Base.Provider>
      )}
    </div>
  )
}

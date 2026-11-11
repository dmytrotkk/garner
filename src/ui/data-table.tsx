import { Link, type LinkProps } from '@tanstack/react-router'
import {
  createColumnHelper,
  createSortedRowModel,
  type RowData,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { quantity } from '../core/format.ts'
import { Actions } from './actions.tsx'
import type { Action } from './command.ts'
import { layer, line, rule } from './grid.tsx'
import { menuOn } from './menu.tsx'

const widths = {
  fill: 'min-w-24 flex-1',
  sm: 'w-20 shrink-0',
  md: 'w-28 shrink-0',
  lg: 'w-40 shrink-0',
}

export type Column<Row> = {
  id: string
  header: string
  cell: (row: Row) => ReactNode
  sort?: (row: Row) => number | string
  width?: keyof typeof widths
  end?: boolean
}

export type Group<Row> = {
  by: string
  of: (row: Row) => string
  head: (key: string, rows: readonly Row[]) => ReactNode
}

export type Fold<Row> = { when: (row: Row) => boolean; label: (count: number) => string }

export type RowActions<Row> = { items: (row: Row) => readonly Action[]; button?: string }

type Props<Row extends RowData> = {
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  initial?: { id: string; desc: boolean }
  group?: Group<Row>
  actions?: RowActions<Row>
  onOpen?: (row: Row) => void
  batch?: number
  fold?: Fold<Row>
  link?: (row: Row) => LinkProps
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic },
})

const glass = 'bg-surface/75 backdrop-blur-bar'
const place = ({ width = 'md', end }: { width?: keyof typeof widths; end?: boolean }) =>
  `${widths[width]} ${end ? 'justify-end text-right' : ''}`

export function DataTable<Row extends RowData>({
  columns,
  rows,
  rowKey,
  initial,
  group,
  actions,
  batch = 50,
  fold,
  link,
  onOpen,
}: Props<Row>) {
  const gutter = actions?.button ? 'pr-12' : ''
  const definitions = useMemo(() => {
    const helper = createColumnHelper<typeof features, Row>()
    return helper.columns(
      columns.map(({ id, sort }) =>
        sort ? helper.accessor(sort, { id, sortFn: 'basic' }) : helper.display({ id }),
      ),
    )
  }, [columns])
  const table = useTable({
    features,
    columns: definitions,
    data: rows,
    getRowId: rowKey,
    initialState: { sorting: initial ? [initial] : [] },
  })
  const model = table.getRowModel().rows
  const sorted = useMemo(() => model.map(({ original }) => original), [model])
  const [shown, setShown] = useState(batch)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const grouped = group && table.state.sorting[0]?.id === group.by ? group : undefined
  const keyOf = (row: Row) => (grouped ? grouped.of(row) : '')
  const all = useMemo(() => grouped && Map.groupBy(sorted, grouped.of), [sorted, grouped])
  const folds = useMemo(
    () =>
      Map.groupBy(fold ? sorted.filter(fold.when) : [], (row) => (grouped ? grouped.of(row) : '')),
    [sorted, fold, grouped],
  )
  const hidden = (row: Row) => Boolean(fold?.when(row)) && !open.has(keyOf(row))
  const listed = sorted.filter((row) => !hidden(row))
  const count = Math.min(listed.length, shown)
  const last = listed[count - 1]
  const span = count < listed.length && last ? sorted.slice(0, sorted.indexOf(last) + 1) : sorted
  const toggle = (key: string) =>
    setOpen((before) => {
      const after = new Set(before)
      if (!after.delete(key)) after.add(key)
      return after
    })
  const summary = (key: string) => {
    const total = folds.get(key)?.length ?? 0
    return (
      fold &&
      total > 0 && (
        <button
          type="button"
          aria-expanded={open.has(key)}
          onClick={() => toggle(key)}
          className={`${line} ${gutter} ${rule} relative h-10 w-full gap-3 transition hover:bg-fill`}
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-tile bg-fill text-dim">
            {open.has(key) ? (
              <ChevronUp aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-3.5" />
            )}
          </span>
          <span className="font-medium">{fold.label(total)}</span>
        </button>
      )
    )
  }

  const entries = (list: readonly Row[]) =>
    list.map((entry) => {
      const cells = columns.map((column) => (
        <span key={column.id} className={`flex min-w-0 items-center truncate ${place(column)}`}>
          {column.cell(entry)}
        </span>
      ))
      const look = `${line} ${gutter} h-10 transition hover:bg-fill group-data-menu-open:bg-fill`
      const items = actions?.items(entry) ?? []
      return (
        <div key={rowKey(entry)} className={`group relative ${rule}`} {...menuOn(items)}>
          {link ? (
            <Link {...link(entry)} className={look}>
              {cells}
            </Link>
          ) : onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(entry)}
              className={`${look} w-full text-left`}
            >
              {cells}
            </button>
          ) : (
            <div className={look}>{cells}</div>
          )}
          {actions?.button && items.length > 0 && (
            <div className={layer}>
              <Actions label={actions.button} items={items} />
            </div>
          )}
        </div>
      )
    })

  return (
    <div className="rounded-surface border border-line bg-surface p-2">
      <div
        className={`${line} ${gutter} ${glass} sticky top-13 z-10 h-8 select-none text-caption text-dim`}
      >
        {columns.map((column) => {
          const state = table.getColumn(column.id)
          const direction = state?.getIsSorted()
          return column.sort ? (
            <button
              key={column.id}
              type="button"
              onClick={state?.getToggleSortingHandler()}
              className={`flex items-center gap-1 transition hover:text-ink ${place(column)} ${direction ? 'text-ink' : ''}`}
            >
              {column.header}
              {direction === 'asc' && <ArrowUp aria-hidden="true" className="size-3" />}
              {direction === 'desc' && <ArrowDown aria-hidden="true" className="size-3" />}
            </button>
          ) : (
            <span key={column.id} className={`flex ${place(column)}`}>
              {column.header}
            </span>
          )
        })}
      </div>
      {grouped && all ? (
        [...Map.groupBy(span, grouped.of)].map(([key, list]) => (
          <section key={key}>
            <div className={`${line} ${rule} ${glass} sticky top-21 z-5 h-16`}>
              {grouped.head(key, all.get(key) ?? list)}
            </div>
            {summary(key)}
            {entries(list.filter((row) => !hidden(row)))}
          </section>
        ))
      ) : (
        <>
          {summary('')}
          {entries(listed.slice(0, count))}
        </>
      )}
      {count < listed.length && (
        <button
          type="button"
          onClick={() => setShown(count + batch)}
          className={`${line} ${rule} relative h-10 w-full justify-center gap-2 text-dim transition hover:bg-fill hover:text-ink`}
        >
          <span className="font-medium">Show {Math.min(batch, listed.length - count)} more</span>
          <span>
            {quantity(count)} of {quantity(listed.length)}
          </span>
        </button>
      )}
    </div>
  )
}

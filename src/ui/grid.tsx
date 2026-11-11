import { Fragment, type ReactNode } from 'react'

export type Column<Row> = { header: string; cell: (row: Row) => ReactNode }

export const line = 'flex items-center gap-4 rounded-control px-3'
export const rule = 'before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-line'
export const layer =
  'absolute inset-y-0 right-1.5 flex items-center opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 has-data-popup-open:opacity-100'

const cellWidth =
  'first:min-w-24 first:flex-1 not-first:w-28 not-first:shrink-0 not-first:text-right'

export function Label({ text, note }: { text: string; note?: string | null }) {
  return (
    <span className="flex gap-2">
      <span className="font-medium">{text}</span>
      {note && <span className="truncate text-dim">{note}</span>}
    </span>
  )
}

type Props<Row> = {
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  gutter?: boolean
  row?: (row: Row, cells: ReactNode) => ReactNode
}

export function Grid<Row>({ columns, rows, rowKey, gutter = false, row }: Props<Row>) {
  const pad = gutter ? 'pr-12' : ''
  return (
    <div className="overflow-x-auto rounded-surface border border-line bg-surface p-2">
      <div className="flex w-max min-w-full flex-col">
        <div className={`${line} ${pad} h-8 select-none text-caption text-dim`}>
          {columns.map(({ header }) => (
            <span key={header} className={cellWidth}>
              {header}
            </span>
          ))}
        </div>
        {rows.map((entry) => {
          const cells = columns.map(({ header, cell }) => (
            <span key={header} className={`truncate ${cellWidth}`}>
              {cell(entry)}
            </span>
          ))
          return (
            <Fragment key={rowKey(entry)}>
              {row ? (
                row(entry, cells)
              ) : (
                <div className={`relative ${rule}`}>
                  <div className={`${line} h-10`}>{cells}</div>
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

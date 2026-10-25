import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Actions } from './actions'
import { layer, line, type RowActions, rule } from './data-table'
import { menuOn } from './menu'

export type Column<Row> = { header: string; cell: (row: Row) => ReactNode }

type Props<Row> = {
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  link?: (row: Row) => LinkProps
  actions?: RowActions<Row>
}

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

export function Table<Row>({ columns, rows, rowKey, link, actions }: Props<Row>) {
  const gutter = actions?.button ? 'pr-12' : ''
  const cells = (row: Row) =>
    columns.map(({ header, cell }) => (
      <span key={header} className={`truncate ${cellWidth}`}>
        {cell(row)}
      </span>
    ))

  return (
    <div className="overflow-x-auto rounded-surface border border-line bg-surface p-2">
      <div className="flex w-max min-w-full flex-col">
        <div className={`${line} ${gutter} h-8 select-none text-caption text-dim`}>
          {columns.map(({ header }) => (
            <span key={header} className={cellWidth}>
              {header}
            </span>
          ))}
        </div>
        {rows.map((row) => {
          const items = actions?.items(row) ?? []
          const look = `${line} ${gutter} h-10 group-data-menu-open:bg-fill`
          return (
            <div key={rowKey(row)} className={`group relative ${rule}`} {...menuOn(items)}>
              {link ? (
                <Link {...link(row)} className={`${look} transition hover:bg-fill`}>
                  {cells(row)}
                </Link>
              ) : (
                <div className={look}>{cells(row)}</div>
              )}
              {actions?.button && items.length > 0 && (
                <div className={layer}>
                  <Actions label={actions.button} items={items} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

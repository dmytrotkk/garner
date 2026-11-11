import { Link, type LinkProps } from '@tanstack/react-router'
import { Actions } from './actions.tsx'
import type { RowActions } from './data-table.tsx'
import { type Column, Grid, layer, line, rule } from './grid.tsx'
import { menuOn } from './menu.tsx'

type Props<Row> = {
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  link?: (row: Row) => LinkProps
  actions?: RowActions<Row>
}

export function Table<Row>({ link, actions, ...grid }: Props<Row>) {
  const gutter = Boolean(actions?.button)
  return (
    <Grid
      {...grid}
      gutter={gutter}
      row={(row, cells) => {
        const items = actions?.items(row) ?? []
        const look = `${line} ${gutter ? 'pr-12' : ''} h-10 group-data-menu-open:bg-fill`
        return (
          <div className={`group relative ${rule}`} {...menuOn(items)}>
            {link ? (
              <Link {...link(row)} className={`${look} transition hover:bg-fill`}>
                {cells}
              </Link>
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
      }}
    />
  )
}

import { Autocomplete } from '@base-ui/react/autocomplete'
import { Dialog } from '@base-ui/react/dialog'
import { Search01Icon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import type { Group } from '../core/search'
import type { Command } from './command'
import { Glyph } from './glyph'
import { Icon } from './icon'
import { Blank, Tile } from './tile'
import { TokenIcon } from './token'

type ListProps = {
  find: (query: string) => Group<Command>[]
  initial: string
  placeholder: string
  onRun: () => void
}

function Lead({ icon }: Pick<Command, 'icon'>) {
  if ('token' in icon) return <TokenIcon id={icon.token} symbol={icon.symbol} />
  if ('tile' in icon) return icon.tile ? <Tile {...icon.tile} size="sm" /> : <Blank />
  return <Glyph glyph={icon} />
}

function List({ find, initial, placeholder, onRun }: ListProps) {
  const [query, setQuery] = useState(initial)
  const run = (command: Command) => {
    onRun()
    command.run()
  }
  return (
    <Autocomplete.Root
      inline
      open
      items={find(query)}
      filter={null}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={({ label }: Command) => label}
      autoHighlight="always"
      keepHighlight
    >
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-line border-b pr-4 pl-4.5">
        <span className="grid size-5 shrink-0 place-items-center text-dim">
          <Icon icon={Search01Icon} />
        </span>
        <Autocomplete.Input
          placeholder={placeholder}
          autoCorrect="off"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="h-full min-w-0 flex-1 text-nav outline-none placeholder:text-dim"
        />
      </div>
      <Autocomplete.List className="max-h-100 overflow-y-auto p-2 empty:hidden">
        {({ label, items }: Group<Command>) => (
          <Autocomplete.Group key={label} items={items} className="not-first:mt-2">
            <Autocomplete.GroupLabel className="flex h-8.5 items-center px-2.5 text-dim">
              {label}
            </Autocomplete.GroupLabel>
            <Autocomplete.Collection>
              {(command: Command) => (
                <Autocomplete.Item
                  key={command.id}
                  value={command}
                  onClick={() => run(command)}
                  className="flex h-8.5 select-none items-center gap-2.5 rounded-control px-2.5 data-highlighted:bg-fill data-[tone=negative]:text-negative"
                  data-tone={command.tone}
                >
                  <span className="grid size-5 shrink-0 place-items-center">
                    <Lead icon={command.icon} />
                  </span>
                  <span className="truncate">{command.label}</span>
                  {command.note && <span className="truncate text-dim">{command.note}</span>}
                  {command.aside && (
                    <span className="ml-auto shrink-0 pl-4 text-dim">{command.aside}</span>
                  )}
                </Autocomplete.Item>
              )}
            </Autocomplete.Collection>
          </Autocomplete.Group>
        )}
      </Autocomplete.List>
      <Autocomplete.Empty className="px-4 py-6 text-dim empty:hidden">
        Nothing found.
      </Autocomplete.Empty>
    </Autocomplete.Root>
  )
}

type Props = Omit<ListProps, 'onRun'> & { open: boolean; onClose: () => void }

export function Palette({ open, onClose, ...list }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-scrim backdrop-blur-veil transition data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          aria-label={list.placeholder}
          finalFocus={false}
          className="fixed inset-x-0 top-20 mx-auto flex w-full max-w-150 flex-col overflow-hidden rounded-surface border border-line bg-sidebar/75 shadow-popover backdrop-blur-glass transition data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:scale-95"
        >
          <List {...list} onRun={onClose} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

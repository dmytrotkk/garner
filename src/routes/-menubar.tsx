import { useRouter } from '@tanstack/react-router'
import { Menu, MenuItem, Submenu } from '@tauri-apps/api/menu'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useRef, useState } from 'react'
import { title } from '../core/format'
import type { Command } from '../ui/command'
import { pages } from './-commands'
import { search, useLayer } from './-layer'
import { toggleSidebar, useSidebar, useTrail } from './-window'

type Bar = {
  menu: Menu
  windows: Submenu
  help: Submenu
  sidebar: MenuItem
  balances: MenuItem
  back: MenuItem
  forward: MenuItem
  guarded: readonly MenuItem[]
}

type Router = ReturnType<typeof useRouter>
type Place = (typeof pages)[number][0]

const reveal = async () => {
  const current = getCurrentWindow()
  await current.unminimize()
  await current.show()
  await current.setFocus()
}

const item = (text: string, action: () => unknown, accelerator?: string) =>
  MenuItem.new({ text, action: () => action(), ...(accelerator && { accelerator }) })

const shown = (action: () => unknown) => () => {
  action()
  return reveal()
}

async function build(commands: readonly Command[], run: (id: string) => unknown, router: Router) {
  const label = (id: string) => {
    const command = commands.find((each) => each.id === id)
    if (!command) throw new Error(`The ${id} command is missing.`)
    return title(command.label)
  }
  const go = (to: Place) => shown(() => router.navigate({ to }))
  const [settings, add, file, sync, find, sidebar, balances, back, forward, main, ...places] =
    await Promise.all([
      item('Settings…', go('/settings'), 'Cmd+,'),
      item(
        label('add-institution'),
        shown(() => run('add-institution')),
      ),
      item(
        label('import'),
        shown(() => run('import')),
      ),
      item(label('sync'), () => run('sync')),
      item('Search…', shown(search), 'Cmd+K'),
      item('Hide Sidebar', toggleSidebar, 'Ctrl+Cmd+S'),
      item(label('privacy'), () => run('privacy')),
      item(
        'Back',
        shown(() => router.history.back()),
        'Cmd+[',
      ),
      item(
        'Forward',
        shown(() => router.history.forward()),
        'Cmd+]',
      ),
      item('Garner', reveal, 'Cmd+0'),
      ...pages.slice(0, 4).map(([to, text]) => item(text, go(to))),
    ])
  const [app, files, edit, view, travel, windows, help] = await Promise.all([
    Submenu.new({
      text: 'Garner',
      items: [
        { item: { About: null }, text: 'About Garner' },
        { item: 'Separator' },
        settings,
        { item: 'Separator' },
        { item: 'Services' },
        { item: 'Separator' },
        { item: 'Hide', text: 'Hide Garner' },
        { item: 'HideOthers' },
        { item: 'ShowAll' },
        { item: 'Separator' },
        { item: 'Quit', text: 'Quit Garner' },
      ],
    }),
    Submenu.new({
      text: 'File',
      items: [
        add,
        file,
        { item: 'Separator' },
        sync,
        { item: 'Separator' },
        { item: 'CloseWindow' },
      ],
    }),
    Submenu.new({
      text: 'Edit',
      items: [
        { item: 'Undo' },
        { item: 'Redo' },
        { item: 'Separator' },
        { item: 'Cut' },
        { item: 'Copy' },
        { item: 'Paste' },
        { item: 'SelectAll' },
        { item: 'Separator' },
        find,
      ],
    }),
    Submenu.new({
      text: 'View',
      items: [
        sidebar,
        balances,
        { item: 'Separator' },
        { item: 'Fullscreen', text: 'Enter Full Screen' },
      ],
    }),
    Submenu.new({ text: 'Go', items: [back, forward, { item: 'Separator' }, ...places] }),
    Submenu.new({
      text: 'Window',
      items: [
        { item: 'Minimize' },
        { item: 'Maximize' },
        { item: 'Separator' },
        main,
        { item: 'Separator' },
        { item: 'BringAllToFront' },
      ],
    }),
    Submenu.new({ text: 'Help', items: [] }),
  ])
  return {
    menu: await Menu.new({ items: [app, files, edit, view, travel, windows, help] }),
    windows,
    help,
    sidebar,
    balances,
    back,
    forward,
    guarded: [settings, add, file, find, ...places],
  }
}

export function MenuBar({ commands }: { commands: readonly Command[] }) {
  const router = useRouter()
  const layer = useLayer()
  const open = useSidebar()
  const { at, end } = useTrail()
  const latest = useRef(commands)
  const [bar, setBar] = useState<Bar>()

  useEffect(() => {
    latest.current = commands
  }, [commands])

  useEffect(() => {
    let gone = false
    const run = (id: string) => latest.current.find((command) => command.id === id)?.run()
    build(latest.current, run, router).then(async (built) => {
      if (gone) return built.menu.close()
      await built.menu.setAsAppMenu()
      await built.windows.setAsWindowsMenuForNSApp()
      await built.help.setAsHelpMenuForNSApp()
      setBar(built)
    })
    return () => {
      gone = true
    }
  }, [router])

  const privacy = commands.find(({ id }) => id === 'privacy')?.label
  const free = layer.kind !== 'prompt'

  useEffect(() => {
    bar?.sidebar.setText(open ? 'Hide Sidebar' : 'Show Sidebar')
  }, [bar, open])

  useEffect(() => {
    if (privacy) bar?.balances.setText(title(privacy))
  }, [bar, privacy])

  useEffect(() => {
    if (!bar) return
    bar.back.setEnabled(free && at > 0)
    bar.forward.setEnabled(free && at < end)
    for (const each of bar.guarded) each.setEnabled(free)
  }, [bar, free, at, end])

  return null
}

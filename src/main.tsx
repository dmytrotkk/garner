import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { serve } from './ai/serve'
import { server } from './ai/server'
import { createDb } from './data/db'
import { gate } from './data/gate'
import { changes, http } from './data/hosts/http'
import { tauri } from './data/hosts/tauri'
import { icon } from './data/icons'
import { refresh } from './data/refresh'
import { migrations } from './data/schema'
import { settings } from './data/settings'
import { search } from './routes/-layer'
import { Failure, NotFound, RouteFailure } from './routes/-screens'
import { toggleSidebar, track } from './routes/-window'
import { routeTree } from './routeTree.gen'
import { provideMenu } from './ui/menu'
import { provideIcons } from './ui/token'
import './ui/tokens.css'

const stale = 15 * 60_000

const desktop = Boolean(import.meta.env.TAURI_ENV_PLATFORM)
document.documentElement.toggleAttribute('data-desktop', desktop)
const host = import.meta.env.TAURI_ENV_PLATFORM ? tauri : http
const db = createDb(host)
const fetch = gate(host.transport)

provideIcons(async (id) => {
  const bytes = await icon(db, host.icon, id)
  return bytes && URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
})

const router = createRouter({
  routeTree,
  context: {
    db,
    desktop,
    fetch,
    links: host.links,
    address: host.address,
  },
  pathParamsAllowedCharacters: [':'],
  defaultErrorComponent: RouteFailure,
  defaultNotFoundComponent: NotFound,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const shortcut = (event: KeyboardEvent) =>
  event.key === 'k'
    ? search
    : event.key === 's' && event.metaKey && event.ctrlKey
      ? toggleSidebar
      : undefined

if (!desktop)
  window.addEventListener('keydown', (event) => {
    const run = (event.metaKey || event.ctrlKey) && shortcut(event)
    if (!run) return
    event.preventDefault()
    run()
  })

if (desktop) {
  provideMenu(tauri.menu)
  track(router.history)
  const focus = () =>
    document.documentElement.toggleAttribute('data-inactive', !document.hasFocus())
  focus()
  window.addEventListener('focus', focus)
  window.addEventListener('blur', focus)
  const selected = ({ clientX: x, clientY: y }: MouseEvent) => {
    const selection = getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) return false
    return [...selection.getRangeAt(0).getClientRects()].some(
      ({ left, right, top, bottom }) => x >= left && x <= right && y >= top && y <= bottom,
    )
  }
  let held = false
  window.addEventListener(
    'mousedown',
    (event) => {
      held = selected(event)
    },
    true,
  )
  window.addEventListener('contextmenu', (event) => {
    const editable = event.target instanceof Element && event.target.closest('input, textarea')
    if (editable || held) return
    event.preventDefault()
    getSelection()?.removeAllRanges()
  })
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
const app = createRoot(root)

try {
  await db.migrate(migrations)
  if (import.meta.env.TAURI_ENV_PLATFORM) {
    const cards = import.meta.glob<string>('../cards/*.html', { query: '?raw', import: 'default' })
    const card = async (name: string) => {
      const load = cards[`../cards/${name}.html`]
      if (!load) throw new Error(`The ${name} card is not built.`)
      return load()
    }
    const sources = { card, icon: host.icon }
    await serve(tauri, () => server({ db, fetch }, sources, () => router.invalidate()))
  } else changes(() => router.invalidate())
  const { syncedAt } = await settings(db)
  if (syncedAt === null || Date.now() - syncedAt > stale)
    refresh(db, fetch, () => router.invalidate())
  app.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
} catch (error) {
  app.render(<Failure error={error} retry={() => location.reload()} />)
}

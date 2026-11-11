import { SidebarLeftIcon } from '@hugeicons/core-free-icons'
import { type RouterHistory, useRouter } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { store } from '../core/store.ts'
import { Glass, GlassSearch } from '../ui/glass.tsx'
import { Icon } from '../ui/icon.tsx'
import { Logo } from '../ui/logo.tsx'
import { search } from './-layer.ts'

type Trail = { at: number; end: number }

const step = (trail: Trail, push: boolean, at: number): Trail => ({
  at,
  end: push ? at : Math.max(trail.end, at),
})

const trail = store<Trail>({ at: 0, end: 0 })

export function track(history: RouterHistory) {
  const at = history.location.state.__TSR_index
  trail.set({ at, end: at })
  history.subscribe(({ location, action }) =>
    trail.set(step(trail.get(), action.type === 'PUSH', location.state.__TSR_index)),
  )
}

const kept = 'sidebar'
const sidebar = store(localStorage.getItem(kept) !== 'hidden')

export const useSidebar = sidebar.use

export const useTrail = trail.use

export function toggleSidebar() {
  sidebar.set(!sidebar.get())
  localStorage.setItem(kept, sidebar.get() ? 'shown' : 'hidden')
}

const chevron = { className: 'size-6 shrink-0', strokeWidth: 1.5, absoluteStrokeWidth: true }

function Arrows() {
  const { history } = useRouter()
  const { at, end } = trail.use()
  return (
    <Glass
      items={[
        {
          label: 'Back',
          icon: <ChevronLeft {...chevron} />,
          onClick: () => history.back(),
          disabled: at === 0,
        },
        {
          label: 'Forward',
          icon: <ChevronRight {...chevron} />,
          onClick: () => history.forward(),
          disabled: at >= end,
        },
      ]}
    />
  )
}

export function Toolbar({ desktop }: { desktop: boolean }) {
  const shown = useSidebar()
  const web = `justify-between pr-2.75 pl-4.75 ${shown ? 'w-52.25' : 'w-23.75'}`
  const mac = `justify-end ${shown ? 'w-52.25 pr-2.75' : 'w-30.5'}`
  return (
    <div
      data-tauri-drag-region
      className={`absolute top-0 left-0 z-20 flex h-13 select-none items-center transition-all duration-250 motion-reduce:transition-none ${desktop ? mac : web}`}
    >
      {!desktop && <Logo />}
      <Glass
        items={[
          {
            label: shown ? 'Hide sidebar' : 'Show sidebar',
            icon: <Icon icon={SidebarLeftIcon} stroke={1.5} />,
            onClick: toggleSidebar,
          },
        ]}
      />
    </div>
  )
}

export function Bar({ desktop }: { desktop: boolean }) {
  const shown = useSidebar()
  return (
    <header
      data-tauri-drag-region
      className={`absolute inset-x-0 top-0 z-10 flex h-13 select-none items-center justify-between pr-2.75 bg-canvas/75 backdrop-blur-bar transition-all duration-250 motion-reduce:transition-none ${desktop && !shown ? 'pl-33.25' : 'pl-2.75'}`}
    >
      <span className="flex">{desktop && <Arrows />}</span>
      <GlassSearch onClick={search} />
    </header>
  )
}

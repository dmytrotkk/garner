import { type ReactNode, useEffect, useRef } from 'react'

export function Scroller({ children }: { children: ReactNode }) {
  const page = useRef<HTMLElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const range = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const main = page.current
    const bar = rail.current
    const spacer = range.current
    if (!main || !bar || !spacer) return
    const fit = () => {
      spacer.style.height = `${main.scrollHeight - main.clientHeight + bar.clientHeight}px`
    }
    const sizes = new ResizeObserver(fit)
    sizes.observe(main)
    if (main.firstElementChild) sizes.observe(main.firstElementChild)
    let echo: HTMLElement | undefined
    const follow = (from: HTMLElement, to: HTMLElement) => () => {
      if (echo === from) {
        echo = undefined
        return
      }
      if (Math.abs(to.scrollTop - from.scrollTop) < 1) return
      echo = to
      to.scrollTop = from.scrollTop
    }
    const lead = follow(main, bar)
    const trail = follow(bar, main)
    main.addEventListener('scroll', lead)
    bar.addEventListener('scroll', trail)
    return () => {
      sizes.disconnect()
      main.removeEventListener('scroll', lead)
      bar.removeEventListener('scroll', trail)
    }
  }, [])
  return (
    <>
      <main ref={page} className="scrollbar-none flex-1 overflow-y-auto overscroll-y-contain">
        {children}
      </main>
      <div ref={rail} className="absolute top-13 right-0 bottom-0 w-4 overflow-y-scroll">
        <div ref={range} />
      </div>
    </>
  )
}

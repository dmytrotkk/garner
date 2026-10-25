import { type ReactNode, useEffect, useRef, useState } from 'react'

export type Noticed = { key: string; node: ReactNode }

type Stack = { keys: string; known: readonly string[]; leaving: readonly string[] }

const settle = ({ known }: Stack, keys: string): Stack => {
  const current = keys.split('\n').filter(Boolean)
  const next = [...known, ...current.filter((key) => !known.includes(key))]
  return { keys, known: next, leaving: next.filter((key) => !current.includes(key)) }
}

export function Notices({ items }: { items: readonly Noticed[] }) {
  const nodes = useRef(new Map<string, ReactNode>())
  const keys = items.map(({ key }) => key).join('\n')
  const [stack, setStack] = useState(() => settle({ keys: '', known: [], leaving: [] }, keys))
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set(stack.known))
  if (stack.keys !== keys) setStack(settle(stack, keys))
  for (const { key, node } of items) nodes.current.set(key, node)
  useEffect(() => {
    const reveal = setTimeout(() => setShown(new Set(keys.split('\n'))), 20)
    const sweep = setTimeout(
      () =>
        setStack((before) => ({
          ...before,
          known: before.known.filter((key) => !before.leaving.includes(key)),
          leaving: [],
        })),
      300,
    )
    return () => {
      clearTimeout(reveal)
      clearTimeout(sweep)
    }
  }, [keys])
  if (!stack.known.length) return null
  return (
    <div className="-mb-6 sticky bottom-6 z-20 mx-auto mt-auto flex w-full max-w-176 flex-col gap-3">
      {stack.known.map((key) => (
        <div key={key} data-shown={shown.has(key) && !stack.leaving.includes(key)} className="fold">
          <div>{nodes.current.get(key)}</div>
        </div>
      ))}
    </div>
  )
}

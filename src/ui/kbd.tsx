export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="flex h-4.5 min-w-4.5 items-center justify-center rounded-control bg-fill px-1.5 font-normal text-caption text-dim">
      {children}
    </kbd>
  )
}

import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { Button } from './button.tsx'
import { Dialog } from './dialog.tsx'
import { Field } from './field.tsx'
import { Input } from './input.tsx'

type Form = { status: 'idle' } | { status: 'pending' } | { status: 'failed'; error: string }

const idle: Form = { status: 'idle' }

type FormDialogProps = {
  title: string
  action: string
  open: boolean
  onClose: () => void
  onSubmit: (form: FormData) => Promise<void>
  children: (error: string | undefined) => ReactNode
}

export function FormDialog({ title, action, open, onClose, onSubmit, children }: FormDialogProps) {
  const id = useId()
  const [form, setForm] = useState(idle)
  const pending = form.status === 'pending'
  const close = () => {
    setForm(idle)
    onClose()
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setForm({ status: 'pending' })
    try {
      await onSubmit(data)
    } catch (error) {
      return setForm({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
    }
    close()
  }

  return (
    <Dialog
      title={title}
      open={open}
      onClose={() => !pending && close()}
      foot={
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={id} disabled={pending}>
            {action}
          </Button>
        </div>
      }
    >
      <form id={id} onSubmit={submit} className="flex flex-col gap-5">
        {children(form.status === 'failed' ? form.error : undefined)}
      </form>
    </Dialog>
  )
}

type NameDialogProps = Pick<FormDialogProps, 'title' | 'action' | 'open' | 'onClose'> & {
  initial?: string
  placeholder: string
  onSubmit: (name: string) => Promise<void>
}

export function NameDialog({ initial, placeholder, onSubmit, ...dialog }: NameDialogProps) {
  return (
    <FormDialog {...dialog} onSubmit={(form) => onSubmit(String(form.get('name')))}>
      {(error) => (
        <Field label="Name" error={error}>
          <Input name="name" defaultValue={initial} placeholder={placeholder} autoComplete="off" />
        </Field>
      )}
    </FormDialog>
  )
}

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button.tsx';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Footer actions; the dialog content itself stays scrollable. */
  footer?: ReactNode;
}

/** Modal dialog: focus trap, Escape to close and focus restore come from Radix. */
export function Dialog({ open, onOpenChange, title, description, children, footer }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <RadixDialog.Content
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-surface shadow-2xl"
          {...(!description && { 'aria-describedby': undefined })}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line p-5">
            <div className="flex flex-col gap-1">
              <RadixDialog.Title className="font-title text-title-md text-ink">{title}</RadixDialog.Title>
              {description && <RadixDialog.Description className="text-body-sm text-ink-muted">{description}</RadixDialog.Description>}
            </div>
            <RadixDialog.Close className="rounded-lg p-1 text-ink-muted hover:bg-surface-sunken" aria-label="Close">
              <X aria-hidden className="h-5 w-5" />
            </RadixDialog.Close>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
          {footer && <div className="flex justify-end gap-3 border-t border-line p-5">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Name the object and the consequence (04_DESIGN_SYSTEM.md §4 Dialog). */
  children: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
}

export function ConfirmDialog({ open, onOpenChange, title, children, confirmLabel, destructive, pending, error, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}
      footer={(
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button variant={destructive ? 'danger' : 'primary'} loading={pending} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      )}>
      <div className="flex flex-col gap-4 text-body text-ink">
        {children}
        {error}
      </div>
    </Dialog>
  );
}

import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.ts';

interface MoneyFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/** Euro amount entered as text (exact decimal string, never a float). */
export const MoneyField = forwardRef<HTMLInputElement, MoneyFieldProps>(function MoneyField({ label, error, hint, id, className, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-body-sm font-semibold text-ink">{label}</label>
      <div className={cn('flex h-10 items-center rounded-lg border bg-surface focus-within:border-pix-blue', error ? 'border-danger' : 'border-line')}>
        <span aria-hidden className="pl-3 font-mono text-ink-muted">€</span>
        <input ref={ref} id={inputId} inputMode="decimal" autoComplete="off" aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={cn('h-full w-full rounded-lg bg-transparent px-2 font-mono text-body outline-none', className)} {...rest} />
      </div>
      {hint && <p id={hintId} className="text-caption text-ink-muted">{hint}</p>}
      {error && <p id={errorId} className="text-caption text-danger">{error}</p>}
    </div>
  );
});

import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.ts';

interface FieldChrome {
  label: string;
  error?: string | undefined;
  hint?: string;
}

function useFieldIds(id: string | undefined, hint?: string, error?: string) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return { fieldId, hintId, errorId, describedBy: [hintId, errorId].filter(Boolean).join(' ') || undefined };
}

function FieldMessages({ hint, hintId, error, errorId }: { hint?: string; hintId?: string | undefined; error?: string | undefined; errorId?: string | undefined }) {
  return (
    <>
      {hint && <p id={hintId} className="text-caption text-ink-muted">{hint}</p>}
      {error && <p id={errorId} className="text-caption text-danger">{error}</p>}
    </>
  );
}

const control = (error?: string) => cn(
  'rounded-lg border bg-surface px-3 text-body outline-none focus:border-pix-blue', error ? 'border-danger' : 'border-line',
);

/** Labelled input with hint and error wired through aria-describedby / aria-invalid. */
export const TextField = forwardRef<HTMLInputElement, FieldChrome & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, error, hint, className, id, ...rest }, ref,
) {
  const ids = useFieldIds(id, hint, error);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={ids.fieldId} className="text-body-sm font-semibold text-ink">{label}</label>
      <input ref={ref} id={ids.fieldId} aria-invalid={error ? true : undefined} aria-describedby={ids.describedBy}
        className={cn('h-10', control(error), className)} {...rest} />
      <FieldMessages hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId} />
    </div>
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextAreaField(
  { label, error, hint, className, id, ...rest }, ref,
) {
  const ids = useFieldIds(id, hint, error);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={ids.fieldId} className="text-body-sm font-semibold text-ink">{label}</label>
      <textarea ref={ref} id={ids.fieldId} rows={3} aria-invalid={error ? true : undefined} aria-describedby={ids.describedBy}
        className={cn('py-2', control(error), className)} {...rest} />
      <FieldMessages hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId} />
    </div>
  );
});

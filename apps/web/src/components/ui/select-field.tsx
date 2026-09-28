import { ChevronDown } from 'lucide-react';
import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.ts';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | undefined;
  /** Visually hide the label (it is still announced), e.g. in compact filter bars. */
  hideLabel?: boolean;
}

/** Native select: fully accessible and keyboard-operable with no extra dependency. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, error, hideLabel, className, id, children, ...rest }, ref,
) {
  const generated = useId();
  const selectId = id ?? generated;
  const errorId = error ? `${selectId}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className={cn('text-body-sm font-semibold text-ink', hideLabel && 'sr-only')}>{label}</label>
      <div className="relative">
        <select ref={ref} id={selectId} aria-invalid={error ? true : undefined} aria-describedby={errorId}
          className={cn('h-10 w-full appearance-none rounded-lg border bg-surface pr-9 pl-3 text-body outline-none focus:border-pix-blue',
            error ? 'border-danger' : 'border-line', className)}
          {...rest}>
          {children}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      </div>
      {error && <p id={errorId} className="text-caption text-danger">{error}</p>}
    </div>
  );
});

import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.ts';

const VARIANTS = {
  primary: 'bg-pix-blue text-white hover:bg-pix-blue-75',
  secondary: 'border-2 border-pix-blue text-pix-blue hover:bg-pix-blue-10',
  ghost: 'text-ink hover:bg-surface-sunken',
  attention: 'bg-pix-yellow text-ink hover:bg-[#ffda41]',
  danger: 'border border-danger text-danger hover:bg-danger-surface',
  link: 'text-pix-blue underline-offset-4 hover:underline px-0',
} as const;

const SIZES = { sm: 'h-8 px-3 text-body-sm', md: 'h-10 px-4 text-body', lg: 'h-12 px-6 text-body w-full' } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Shows a spinner, sets aria-busy and blocks further clicks while a mutation runs. */
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant], SIZES[size], className,
      )}
      {...rest}
    >
      {loading && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

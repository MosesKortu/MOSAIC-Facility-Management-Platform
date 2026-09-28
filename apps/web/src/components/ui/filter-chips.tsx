import { cn } from '../../lib/cn.ts';

interface FilterChipsProps<T extends string> {
  label: string;
  options: readonly { value: T | null; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
}

/** Small mutually exclusive filter (e.g. facility). Selection is exposed with aria-pressed. */
export function FilterChips<T extends string>({ label, options, value, onChange }: FilterChipsProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button key={option.label} type="button" aria-pressed={selected} onClick={() => onChange(option.value)}
            className={cn('h-9 rounded-full border px-4 text-body-sm font-semibold transition-colors',
              selected ? 'border-pix-blue bg-pix-blue text-white' : 'border-line bg-surface text-ink hover:border-pix-blue')}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

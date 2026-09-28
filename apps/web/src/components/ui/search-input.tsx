import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SearchInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Search box that reports its value after typing pauses (keeps the URL and API calls calm). */
export function SearchInput({ label, value, onChange, placeholder }: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  // Follow external changes (e.g. back/forward navigation) by adjusting state during render.
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div className="relative min-w-0 flex-1">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      <input type="search" aria-label={label} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
        className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-body outline-none focus:border-pix-blue" />
    </div>
  );
}

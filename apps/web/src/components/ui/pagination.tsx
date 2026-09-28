import { Button } from './button.tsx';

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
}

export function Pagination({ total, limit, offset, onOffsetChange }: PaginationProps) {
  if (total <= limit) return null;
  const first = offset + 1;
  const last = Math.min(offset + limit, total);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-body-sm text-ink-muted">
      <p>Showing <span className="font-mono">{first}–{last}</span> of <span className="font-mono">{total}</span></p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => onOffsetChange(Math.max(0, offset - limit))}>Previous</Button>
        <Button variant="ghost" size="sm" disabled={last >= total} onClick={() => onOffsetChange(offset + limit)}>Next</Button>
      </div>
    </nav>
  );
}

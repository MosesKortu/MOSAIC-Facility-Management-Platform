import type { UserListQuery } from '@mosaic/contracts';
import { useId, useState } from 'react';
import { SearchInput } from '../../components/ui/search-input.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { cn } from '../../lib/cn.ts';
import { ROLE_LABEL } from '../auth/roles.ts';
import { useUsers } from './api.ts';

interface UserPickerProps {
  label: string;
  value: string | null;
  onChange: (userId: string) => void;
  /** Restricts candidates, e.g. { user_type: 'internal', is_active: 'true' } for sponsors. */
  filter?: Pick<UserListQuery, 'user_type' | 'is_active'>;
  /** Ids that cannot be chosen (e.g. existing members). */
  exclude?: readonly string[];
  error?: string | undefined;
}

/** Searchable single-choice list of people: scales to any directory size (server-side search). */
export function UserPicker({ label, value, onChange, filter, exclude = [], error }: UserPickerProps) {
  const [q, setQ] = useState('');
  const users = useUsers({ ...filter, q: q || undefined, limit: 20, offset: 0 });
  const errorId = useId();
  const candidates = (users.data?.items ?? []).filter((u) => !exclude.includes(u.user_id));

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? errorId : undefined}>
      <legend className="text-body-sm font-semibold text-ink">{label}</legend>
      <SearchInput label={`Search ${label.toLowerCase()}`} value={q} onChange={setQ} placeholder="Search by name or email" />
      <div className={cn('max-h-56 overflow-y-auto rounded-lg border', error ? 'border-danger' : 'border-line')}>
        {users.isPending ? (
          <div className="flex flex-col gap-2 p-3" aria-busy="true"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
        ) : users.isError ? (
          <p className="p-3 text-body-sm text-danger">People could not be loaded. {users.error.message}</p>
        ) : candidates.length === 0 ? (
          <p className="p-3 text-body-sm text-ink-muted">{q ? 'Nobody matches this search.' : 'Nobody is available to choose.'}</p>
        ) : (
          candidates.map((user) => (
            <label key={user.user_id} className={cn('flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-sunken',
              value === user.user_id && 'bg-pix-blue-10')}>
              <input type="radio" name={label} checked={value === user.user_id} onChange={() => onChange(user.user_id)} className="accent-pix-blue" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body font-semibold">{user.full_name}</span>
                <span className="truncate text-caption text-ink-muted">{user.email} · {ROLE_LABEL[user.role]}</span>
              </span>
            </label>
          ))
        )}
      </div>
      {users.data && users.data.total > candidates.length && !q && (
        <p className="text-caption text-ink-muted">Showing the first {candidates.length} — search to find others.</p>
      )}
      {error && <p id={errorId} className="text-caption text-danger">{error}</p>}
    </fieldset>
  );
}

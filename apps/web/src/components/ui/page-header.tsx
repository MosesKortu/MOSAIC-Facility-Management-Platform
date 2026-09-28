import type { ReactNode } from 'react';

/** One h1 per page, with its supporting line and primary action (04_DESIGN_SYSTEM.md §2.2). */
export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="font-title text-title-lg text-ink">{title}</h1>
        {description && <p className="text-body text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

import { FACILITY_NAME } from '@mosaic/contracts';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '../../components/ui/card.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { EmptyState, ErrorState } from '../../components/ui/states.tsx';
import { formatDate } from '../../lib/format.ts';
import { AccessBadge } from '../equipment/components.tsx';
import { ACCESS } from '../equipment/labels.ts';
import { useMyCertifications } from './api.ts';

/** /training — the user's certification status across instruments, before they try to book. */
export function TrainingPage() {
  const certifications = useMyCertifications();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Training & certifications" description="Where you stand on each instrument, and what to do next." />
      {certifications.isPending ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-3"><span className="sr-only">Loading…</span><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : certifications.isError ? (
        <ErrorState error={certifications.error} onRetry={() => void certifications.refetch()} />
      ) : certifications.data.length === 0 ? (
        <EmptyState title="You haven't started training on any instrument yet."
          action={<Link to="/equipment" className="font-semibold text-pix-blue hover:underline">Find an instrument →</Link>}>
          Open an instrument to read its SOP and take the safety quiz.
        </EmptyState>
      ) : (
        <>
          <ul aria-label="Certification summary" className="grid grid-cols-3 gap-3">
            {[
              { label: `${certifications.data.filter((c) => c.access === 'certified').length} certified`, hint: 'Ready to book' },
              { label: `${certifications.data.filter((c) => ['assessment_pending', 'assessment_required'].includes(c.access)).length} in progress`, hint: 'Theory done' },
              { label: `${certifications.data.filter((c) => ['reassessment_needed', 'expired', 'training_required'].includes(c.access)).length} need action`, hint: 'Something to do' },
            ].map((kpi) => (
              <li key={kpi.hint}><Card className="flex flex-col gap-1"><span className="font-title text-title-sm">{kpi.label}</span><span className="text-caption text-ink-muted">{kpi.hint}</span></Card></li>
            ))}
          </ul>
          <ul className="flex flex-col gap-3">
            {certifications.data.map((c) => (
              <li key={c.cert_id}>
                <Link to={`/training/${c.equipment_id}`} className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 hover:border-pix-blue">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-semibold text-ink">{c.equipment_name}</span>
                    <span className="text-caption text-ink-muted">{FACILITY_NAME[c.facility]} · <span className="font-mono">{c.equipment_code}</span></span>
                    <span className="text-body-sm text-ink">{ACCESS[c.access].next}</span>
                    {c.expires_at && c.access === 'certified' && <span className="text-caption text-ink-muted">Valid until <span className="font-mono">{formatDate(c.expires_at)}</span></span>}
                  </div>
                  <AccessBadge access={c.access} />
                  <ChevronRight aria-hidden className="h-5 w-5 text-ink-muted group-hover:text-pix-blue" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

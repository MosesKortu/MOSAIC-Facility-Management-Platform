import { FACILITIES, FACILITY_NAME, type Facility, type PendingAssessment } from '@mosaic/contracts';
import { useState } from 'react';
import { Alert } from '../../components/ui/alert.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { TextAreaField } from '../../components/ui/field.tsx';
import { FilterChips } from '../../components/ui/filter-chips.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { EmptyState, ErrorState } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { TableSkeleton } from '../../components/ui/table-skeleton.tsx';
import { ApiError } from '../../lib/api.ts';
import { formatDateTime } from '../../lib/format.ts';
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { useDecision, usePendingAssessments } from './api.ts';

const FACILITY_OPTIONS = [{ value: null, label: 'All' }, ...FACILITIES.map((f) => ({ value: f, label: f }))] as const;

/** /operations/certifications — practical assessments waiting for sign-off, oldest first. */
export function CertificationQueuePage() {
  const { params, update } = useUrlFilters();
  const facility = (FACILITIES as readonly string[]).includes(params.get('facility') ?? '') ? (params.get('facility') as Facility) : null;
  const queue = usePendingAssessments({ facility: facility ?? undefined });
  const [reviewing, setReviewing] = useState<PendingAssessment | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Certification queue" description={queue.data ? `${queue.data.length} practical assessment${queue.data.length === 1 ? '' : 's'} waiting, oldest first.` : undefined} />
      <FilterChips label="Facility" options={FACILITY_OPTIONS} value={facility} onChange={(f) => update({ facility: f })} />
      {queue.isPending ? <TableSkeleton label="pending assessments" />
        : queue.isError ? <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
        : queue.data.length === 0 ? <EmptyState title="No practical assessments are waiting." />
        : (
          <Table caption="Pending practical assessments">
            <thead><tr><Th>Researcher</Th><Th>Instrument</Th><Th className="text-right">Quiz</Th><Th>Requested</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {queue.data.map((p) => (
                <tr key={p.cert_id}>
                  <Td>
                    <span className="font-semibold">{p.user.full_name}</span>
                    {p.user.user_type === 'external' && <span className="ml-2"><Badge tone="neutral">External</Badge></span>}
                    <span className="block text-caption text-ink-muted">{p.user.email}</span>
                  </Td>
                  <Td><span className="font-mono">{p.equipment.code}</span><span className="block text-caption text-ink-muted">{FACILITY_NAME[p.equipment.facility]}</span></Td>
                  <Td className="text-right font-mono">{p.theoretical_score === null ? '—' : `${p.theoretical_score}%`}</Td>
                  <Td className="font-mono whitespace-nowrap">{formatDateTime(p.practical_requested_at)}</Td>
                  <Td className="text-right">
                    <Button size="sm" aria-label={`Review ${p.user.full_name} for ${p.equipment.code}`} onClick={() => setReviewing(p)}>Review</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      {reviewing && <ReviewDialog assessment={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

function ReviewDialog({ assessment, onClose }: { assessment: PendingAssessment; onClose: () => void }) {
  const decision = useDecision();
  const [feedback, setFeedback] = useState('');
  const [needsFeedback, setNeedsFeedback] = useState(false);
  const alreadyDecided = decision.error instanceof ApiError && decision.error.code === 'ALREADY_ACTIONED';

  function reject() {
    if (feedback.trim() === '') return setNeedsFeedback(true);
    decision.mutate({ certId: assessment.cert_id, body: { decision: 'rejected', reason: feedback.trim() } }, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Practical assessment"
      description={`${assessment.user.full_name} · ${assessment.equipment.code}`}
      footer={alreadyDecided ? <Button onClick={onClose}>Close</Button> : <>
        <Button variant="danger" disabled={decision.isPending} onClick={reject}>Request reassessment</Button>
        <Button loading={decision.isPending}
          onClick={() => decision.mutate({ certId: assessment.cert_id, body: { decision: 'signed_off' } }, { onSuccess: onClose })}>
          Approve certification
        </Button>
      </>}>
      <div className="flex flex-col gap-4">
        {alreadyDecided
          ? <Alert tone="info" title="Already decided">Another super user has already decided this request. The queue has been refreshed.</Alert>
          : decision.error && <Alert tone="danger" title="The decision was not saved">{decision.error.message}</Alert>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
          <dt className="text-ink-muted">Researcher</dt><dd>{assessment.user.full_name} <span className="text-ink-muted">({assessment.user.email})</span></dd>
          <dt className="text-ink-muted">Instrument</dt><dd>{assessment.equipment.name}</dd>
          <dt className="text-ink-muted">Quiz score</dt><dd className="font-mono">{assessment.theoretical_score === null ? '—' : `${assessment.theoretical_score}%`}</dd>
          <dt className="text-ink-muted">Requested</dt><dd className="font-mono">{formatDateTime(assessment.practical_requested_at)}</dd>
        </dl>
        <p className="text-body-sm text-ink-muted">Approve only after observing the researcher operate the instrument safely. Approval is recorded with your name and sets the certification's expiry.</p>
        <TextAreaField label="Feedback for the researcher" hint="Required to request a reassessment" value={feedback}
          onChange={(e) => { setFeedback(e.target.value); setNeedsFeedback(false); }}
          error={needsFeedback ? 'Tell the researcher what to improve — they will see this.' : undefined} />
      </div>
    </Dialog>
  );
}

import type { BookingBody, EquipmentDetail, FundingOption, PersonRef, SupportTier } from '@mosaic/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { TextField } from '../../components/ui/field.tsx';
import { SearchInput } from '../../components/ui/search-input.tsx';
import { SelectField } from '../../components/ui/select-field.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { ErrorState, NotFound, PageLoading } from '../../components/ui/states.tsx';
import { Stepper, type Step } from '../../components/ui/stepper.tsx';
import { ApiError } from '../../lib/api.ts';
import { cn } from '../../lib/cn.ts';
import { formatDate, formatDateTime, formatMoney, formatTime } from '../../lib/format.ts';
import { useSession } from '../auth/api.ts';
import { STAFF_ROLES } from '../auth/roles.ts';
import { useEquipment } from '../equipment/api.ts';
import { ACCESS, EQUIPMENT_STATUS, SUPPORT_TIER_LABEL } from '../equipment/labels.ts';
import { useAvailability, useBeneficiaries, useCreateBooking, useFunding, useQuote } from './api.ts';
import { bookingProblem, UNUSABLE_REASON, type BookingStep } from './messages.ts';
import { dayRange, durationOptions, formatDuration, startOptions, todayLocal } from './slots.ts';

const STEPS: { key: BookingStep | 'review'; label: string }[] = [
  { key: 'time', label: 'Date & time' }, { key: 'support', label: 'Support' }, { key: 'funding', label: 'Funding' }, { key: 'review', label: 'Review' },
];
const CHANGE_LABEL: Record<BookingStep, string> = { time: 'Change the time', support: 'Change support', funding: 'Change funding' };

/** /equipment/:equipmentId/book — date & time → support → funding → review and confirm (03 §3.1). */
export function BookingPage() {
  const equipmentId = useParams().equipmentId!;
  const equipment = useEquipment(equipmentId);
  const session = useSession();

  if (equipment.isPending || session.isPending) return <PageLoading label="Loading the instrument" />;
  if (equipment.isError) {
    if (equipment.error instanceof ApiError && equipment.error.code === 'NOT_FOUND') return <NotFound what="instrument" />;
    return <ErrorState error={equipment.error} onRetry={() => void equipment.refetch()} />;
  }
  const e = equipment.data;
  // Staff are gated server-side as the person they book for, and may override status (D20 d).
  const staff = Boolean(session.data && STAFF_ROLES.includes(session.data.role));
  const blocker = !staff && e.my_certification.access !== 'certified'
    ? <Alert tone="warning" title="You are not certified for this instrument yet"
        action={<Link to={`/training/${e.equipment_id}`} className="font-semibold text-pix-blue hover:underline">Go to training</Link>}>
        {ACCESS[e.my_certification.access].next}
      </Alert>
    : !staff && e.status !== 'operational'
      ? <Alert tone={e.status === 'offline' ? 'danger' : 'warning'} title={`This instrument is ${EQUIPMENT_STATUS[e.status].phrase}`}>
          New bookings open again when it is operational. Existing bookings are kept.
        </Alert>
      : e.availability_windows.length === 0
        ? <Alert tone="warning" title="No bookable hours are set">The facility has not set weekly hours for this instrument yet.</Alert>
        : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link to={`/equipment/${e.equipment_id}`} className="text-body-sm font-semibold text-pix-blue hover:underline">← {e.name}</Link>
      <div className="flex flex-col gap-1">
        <span className="eyebrow font-mono normal-case">{e.code}</span>
        <h1 className="font-title text-title-lg text-ink">Book {e.name}</h1>
        <p className="text-body text-ink-muted">
          <span className="font-mono">{formatMoney(e.base_rate_hourly)}</span> per hour · {e.buffer_time_minutes} min buffer between bookings · times in facility time (Barcelona)
        </p>
      </div>
      {blocker ?? <BookingFlow equipment={e} staff={staff} />}
    </div>
  );
}

function BookingFlow({ equipment, staff }: { equipment: EquipmentDetail; staff: boolean }) {
  const navigate = useNavigate();
  const [bookFor, setBookFor] = useState<'self' | 'other'>('self');
  const [beneficiary, setBeneficiary] = useState<PersonRef | null>(null);
  const [override, setOverride] = useState(false);
  const needsOverride = equipment.status !== 'operational';
  const [step, setStep] = useState<BookingStep | 'review'>('time');
  const [date, setDate] = useState(todayLocal);
  const [start, setStart] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [support, setSupport] = useState<SupportTier>('none');
  const [allocationId, setAllocationId] = useState<string | null>(null);
  const create = useCreateBooking();

  const body: BookingBody | null = start && minutes && allocationId ? {
    equipment_id: equipment.equipment_id, allocation_id: allocationId, start_time: start,
    end_time: new Date(Date.parse(start) + minutes * 60_000).toISOString(), support_requested: support,
    ...(staff && { on_behalf_of_user_id: bookFor === 'other' ? beneficiary?.user_id ?? null : null, force_override: override }),
  } : null;
  const ready = (bookFor === 'self' || beneficiary !== null) && (!needsOverride || override);
  const index = STEPS.findIndex((s) => s.key === step);
  const steps: Step[] = STEPS.map((s, i) => ({ label: s.label, state: i < index ? 'complete' : i === index ? 'current' : 'upcoming' }));

  return (
    <>
      <Card><Stepper label="Booking progress" steps={steps} /></Card>
      {step === 'time' && staff && (
        <BookFor mode={bookFor} beneficiary={beneficiary}
          onMode={(m) => { setBookFor(m); setBeneficiary(null); setAllocationId(null); }}
          onBeneficiary={(p) => { setBeneficiary(p); setAllocationId(null); }} />
      )}
      {step === 'time' && staff && needsOverride && (
        <Alert tone={equipment.status === 'offline' ? 'danger' : 'warning'} title={`This instrument is ${EQUIPMENT_STATUS[equipment.status].phrase}`}>
          <label className="mt-1 flex items-center gap-2 text-ink">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="h-4 w-4 accent-pix-blue" />
            Book despite the status (staff override, recorded in the audit log)
          </label>
        </Alert>
      )}
      {step === 'time' && (
        <TimeStep ready={ready} equipment={equipment} date={date} start={start} minutes={minutes}
          onDate={(d) => { setDate(d); setStart(null); setMinutes(null); }}
          onStart={(s, first) => { setStart(s); setMinutes(first); }} onMinutes={setMinutes}
          onContinue={() => setStep('support')} />
      )}
      {step === 'support' && <SupportStep equipment={equipment} value={support} onChange={setSupport} onBack={() => setStep('time')} onContinue={() => setStep('funding')} />}
      {step === 'funding' && <FundingStep userId={bookFor === 'other' ? beneficiary?.user_id : undefined} value={allocationId} onChange={setAllocationId} onBack={() => setStep('support')} onContinue={() => setStep('review')} />}
      {step === 'review' && body && (
        <ReviewStep equipment={equipment} body={body} minutes={minutes!} beneficiary={bookFor === 'other' ? beneficiary : null} onChange={setStep} create={create}
          onConfirm={() => create.mutate(body, { onSuccess: (b) => void navigate(`/bookings/${b.booking_id}`, { state: { created: true } }) })} />
      )}
    </>
  );
}

function StepCard({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-title text-title-sm">{title}</h2>
      {children}
      <div className="flex flex-wrap gap-3 pt-1">{footer}</div>
    </Card>
  );
}

function TimeStep({ ready, equipment, date, start, minutes, onDate, onStart, onMinutes, onContinue }: {
  /** Everything outside this step that must be settled first (staff: who it is for, override). */
  ready: boolean;
  equipment: EquipmentDetail; date: string; start: string | null; minutes: number | null;
  onDate: (date: string) => void; onStart: (start: string, firstDuration: number | null) => void; onMinutes: (m: number) => void; onContinue: () => void;
}) {
  const range = useMemo(() => dayRange(date), [date]);
  const availability = useAvailability(equipment.equipment_id, range);
  const busy = availability.data?.busy ?? [];
  const windows = equipment.availability_windows;
  const starts = availability.data ? startOptions({ date, windows, busy, now: new Date() }) : [];
  const durations = start ? durationOptions({ start, date, windows, busy }) : [];

  return (
    <StepCard title="1 · Date and time" footer={<Button disabled={!start || !minutes || !ready} onClick={onContinue}>Continue</Button>}>
      <div className="w-56"><TextField label="Date" type="date" min={todayLocal()} value={date} onChange={(e) => e.target.value && onDate(e.target.value)} /></div>
      {availability.isPending ? (
        <div role="status" aria-busy="true" className="flex gap-3"><span className="sr-only">Loading free times…</span><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-40" /></div>
      ) : availability.isError ? (
        <Alert tone="danger" title="Free times could not be loaded" action={<Button variant="secondary" size="sm" onClick={() => void availability.refetch()}>Try again</Button>}>
          {availability.error.message}
        </Alert>
      ) : starts.length === 0 ? (
        <p className="text-body text-ink-muted">Nothing can be booked on {formatDate(date)}: the instrument is closed or fully booked, or the day has passed. Try another date.</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          <div className="w-40">
            <SelectField label="Start time" value={start ?? ''} onChange={(e) => {
              const value = e.target.value;
              onStart(value, durationOptions({ start: value, date, windows, busy })[0] ?? null);
            }}>
              <option value="" disabled>Choose…</option>
              {starts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectField>
          </div>
          <div className="w-40">
            <SelectField label="Duration" value={minutes ?? ''} disabled={!start} onChange={(e) => onMinutes(Number(e.target.value))}>
              {durations.map((d) => <option key={d} value={d}>{formatDuration(d)}</option>)}
            </SelectField>
          </div>
        </div>
      )}
      {busy.length > 0 && (
        <div className="text-body-sm text-ink-muted">
          <p className="font-semibold text-ink">Unavailable on this day (bookings and their buffer time)</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono">
            {busy.map((b) => <li key={b.start}>{formatTime(b.start)}–{formatTime(b.end)}{b.mine && <span className="font-sans"> (yours)</span>}</li>)}
          </ul>
        </div>
      )}
    </StepCard>
  );
}

function Choice({ name, checked, disabled, onChange, title, detail, aside }: {
  name: string; checked: boolean; disabled?: boolean; onChange: () => void; title: string; detail?: ReactNode; aside?: ReactNode;
}) {
  return (
    <label className={cn('flex items-center gap-3 rounded-lg border-2 p-3',
      disabled ? 'cursor-not-allowed border-line bg-surface-sunken text-ink-muted' : 'cursor-pointer',
      checked ? 'border-pix-blue bg-surface-sunken' : !disabled && 'border-line hover:border-pix-blue-50')}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="accent-pix-blue" />
      <span className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{title}</span>{detail && <span className="text-body-sm">{detail}</span>}</span>
      {aside}
    </label>
  );
}

function SupportStep({ equipment, value, onChange, onBack, onContinue }: {
  equipment: EquipmentDetail; value: SupportTier; onChange: (tier: SupportTier) => void; onBack: () => void; onContinue: () => void;
}) {
  return (
    <StepCard title="2 · Support" footer={<><Button variant="ghost" onClick={onBack}>Back</Button><Button onClick={onContinue}>Continue</Button></>}>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Support level</legend>
        {equipment.support_tariffs.map((t) => (
          <Choice key={t.tier} name="support" checked={value === t.tier} disabled={!t.is_available} onChange={() => onChange(t.tier)}
            title={SUPPORT_TIER_LABEL[t.tier]}
            detail={!t.is_available ? 'Not offered at the moment' : t.tier === 'none' ? 'You operate the instrument yourself' : undefined}
            aside={<span className="font-mono text-body-sm">{t.tier === 'none' ? 'no charge' : `${formatMoney(t.rate_hourly)}/h`}</span>} />
        ))}
      </fieldset>
    </StepCard>
  );
}

function FundingStep({ userId, value, onChange, onBack, onContinue }: {
  userId: string | undefined; value: string | null; onChange: (id: string) => void; onBack: () => void; onContinue: () => void;
}) {
  const funding = useFunding(userId);
  return (
    <StepCard title="3 · Funding" footer={<><Button variant="ghost" onClick={onBack}>Back</Button><Button disabled={!value} onClick={onContinue}>Continue</Button></>}>
      {funding.isPending ? <div role="status" aria-busy="true" className="flex flex-col gap-2"><span className="sr-only">Loading funding…</span><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        : funding.isError ? <ErrorState error={funding.error} onRetry={() => void funding.refetch()} />
        : funding.data.length === 0 ? (
          <Alert tone="warning" title={userId ? 'This person has no funding to book with' : 'You have no funding to book with'}>
            Bookings are charged to a grant allocation of one of your research groups. Ask your group leader or a facility administrator to add you to a funded group.
          </Alert>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Grant allocation</legend>
            {funding.data.map((f: FundingOption) => (
              <Choice key={f.allocation_id} name="funding" checked={value === f.allocation_id} disabled={!f.usable} onChange={() => onChange(f.allocation_id)}
                title={`${f.grant_code} · ${f.group.name}`}
                detail={f.unusable_reason ? UNUSABLE_REASON[f.unusable_reason] : <>Valid until {formatDate(f.expiration_date)}</>}
                aside={<span className="text-right font-mono text-body-sm">{formatMoney(f.remaining_balance)}<span className="block font-sans text-caption text-ink-muted">left</span></span>} />
            ))}
          </fieldset>
        )}
    </StepCard>
  );
}

function ReviewStep({ equipment, body, minutes, beneficiary, onChange, onConfirm, create }: {
  equipment: EquipmentDetail; body: BookingBody; minutes: number; beneficiary: PersonRef | null; onChange: (step: BookingStep) => void; onConfirm: () => void;
  create: ReturnType<typeof useCreateBooking>;
}) {
  const quote = useQuote(body);
  const problem = create.error ? bookingProblem(create.error, equipment.equipment_id) : quote.error ? bookingProblem(quote.error, equipment.equipment_id) : null;
  const row = (label: string, value: ReactNode, strong = false) => (
    <div className="flex justify-between gap-4 py-1.5"><dt className="text-ink-muted">{label}</dt><dd className={cn('text-right', strong && 'font-semibold')}>{value}</dd></div>
  );

  return (
    <section aria-labelledby="review-heading">
      <Card className="flex flex-col gap-4">
        <h2 id="review-heading" className="font-title text-title-sm">Review</h2>
        <dl className="divide-y divide-line text-body">
          {row('Instrument', equipment.name)}
          {row('When', <><span className="font-mono">{formatDateTime(body.start_time)}–{formatTime(body.end_time)}</span> · {formatDuration(minutes)}</>)}
          {row('Support', SUPPORT_TIER_LABEL[body.support_requested ?? 'none'])}
          {beneficiary && row('Booked for', beneficiary.full_name)}
          {body.force_override && row('Status override', 'Yes — recorded in the audit log')}
        </dl>
        {quote.isPending ? <div role="status" aria-busy="true"><span className="sr-only">Checking the booking…</span><Skeleton className="h-24" /></div>
          : quote.data && (
            <dl className="divide-y divide-line rounded-lg bg-surface-sunken px-4 py-2 text-body [&_dd]:font-mono">
              {row('Instrument time', formatMoney(quote.data.calculated_base_cost))}
              {row('Support', formatMoney(quote.data.calculated_support_cost))}
              {row('Total charged now', formatMoney(quote.data.total_cost), true)}
              {row('Left on this allocation afterwards', formatMoney(quote.data.allocation_remaining_after))}
            </dl>
          )}
        {problem && (
          <Alert tone="danger" title={problem.title} action={
            problem.step ? <Button variant="secondary" size="sm" onClick={() => { create.reset(); onChange(problem.step!); }}>{CHANGE_LABEL[problem.step]}</Button>
              : problem.link && <Link to={problem.link.to} className="font-semibold text-pix-blue hover:underline">{problem.link.label}</Link>
          }>{problem.detail}</Alert>
        )}
        <p className="text-body-sm text-ink-muted">The total is charged to the allocation when you confirm. Cancelling before the slot starts refunds it in full.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" onClick={() => onChange('funding')}>Back</Button>
          <Button loading={create.isPending} disabled={!quote.data || quote.isError} onClick={onConfirm}>Confirm booking</Button>
        </div>
      </Card>
    </section>
  );
}

/** Staff only: book for yourself or, as a proxy booking, for someone else (audited). */
function BookFor({ mode, beneficiary, onMode, onBeneficiary }: {
  mode: 'self' | 'other'; beneficiary: PersonRef | null; onMode: (m: 'self' | 'other') => void; onBeneficiary: (p: PersonRef) => void;
}) {
  const [q, setQ] = useState('');
  return (
    <Card className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-body-sm font-semibold text-ink">Book for</legend>
        {(['self', 'other'] as const).map((m) => (
          <label key={m} className="flex items-center gap-2 text-body">
            <input type="radio" name="book-for" checked={mode === m} onChange={() => onMode(m)} className="accent-pix-blue" />
            {m === 'self' ? 'Myself' : 'Someone else'}
          </label>
        ))}
      </fieldset>
      {mode === 'other' && (
        <>
          <SearchInput label="Search people" value={q} onChange={setQ} placeholder="Search by name or email" />
          <People q={q} value={beneficiary} onChange={onBeneficiary} />
          <p className="text-caption text-ink-muted">Every check runs as this person: their certification and their group funding. The booking is recorded in the audit log.</p>
        </>
      )}
    </Card>
  );
}

function People({ q, value, onChange }: { q: string; value: PersonRef | null; onChange: (p: PersonRef) => void }) {
  const people = useBeneficiaries(q);
  if (people.isPending) return <div role="status" aria-busy="true"><span className="sr-only">Searching…</span><Skeleton className="h-16" /></div>;
  if (people.isError) return <p role="alert" className="text-body-sm text-danger">People could not be loaded. {people.error.message}</p>;
  if (people.data.length === 0) return <p className="text-body-sm text-ink-muted">Nobody matches this search.</p>;
  return (
    <fieldset className="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-line">
      <legend className="sr-only">Person</legend>
      {people.data.map((p) => (
        <label key={p.user_id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-sunken">
          <input type="radio" name="beneficiary" checked={value?.user_id === p.user_id} onChange={() => onChange(p)} className="accent-pix-blue" />
          <span className="flex flex-col"><span className="font-semibold">{p.full_name}</span><span className="text-caption text-ink-muted">{p.email}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

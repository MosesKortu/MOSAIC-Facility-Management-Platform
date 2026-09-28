import type { EquipmentDetail, QuizResult, TrainingModule } from '@mosaic/contracts';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { ErrorState, NotFound, PageLoading } from '../../components/ui/states.tsx';
import { Stepper, type Step } from '../../components/ui/stepper.tsx';
import { ApiError } from '../../lib/api.ts';
import { cn } from '../../lib/cn.ts';
import { formatDate } from '../../lib/format.ts';
import { useEquipment } from '../equipment/api.ts';
import { AccessBadge } from '../equipment/components.tsx';
import { useRequestPractical, useSubmitQuiz, useTrainingModule } from './api.ts';

/** /training/:equipmentId — SOP → safety quiz → practical assessment → certified (08 §4). */
export function TrainingDetailPage() {
  const equipmentId = useParams().equipmentId!;
  const equipment = useEquipment(equipmentId);
  const module = useTrainingModule(equipmentId);

  if (equipment.isPending) return <PageLoading label="Loading training" />;
  if (equipment.isError) {
    if (equipment.error instanceof ApiError && equipment.error.code === 'NOT_FOUND') return <NotFound what="instrument" />;
    return <ErrorState error={equipment.error} onRetry={() => void equipment.refetch()} />;
  }
  return <TrainingView equipment={equipment.data} module={module} />;
}

function steps(access: EquipmentDetail['my_certification']['access'], quizOpen: boolean): Step[] {
  const theoryDone = access !== 'training_required';
  return [
    { label: 'Read SOP', state: theoryDone || quizOpen ? 'complete' : 'current' },
    { label: 'Safety quiz', state: theoryDone ? 'complete' : quizOpen ? 'current' : 'upcoming' },
    { label: 'Practical assessment', state: access === 'certified' ? 'complete' : access === 'reassessment_needed' ? 'error' : theoryDone ? 'current' : 'upcoming' },
    { label: 'Certified', state: access === 'certified' ? 'complete' : 'upcoming' },
  ];
}

function TrainingView({ equipment, module }: { equipment: EquipmentDetail; module: ReturnType<typeof useTrainingModule> }) {
  const cert = equipment.my_certification;
  const [phase, setPhase] = useState<'sop' | 'quiz'>('sop');
  const [result, setResult] = useState<QuizResult | null>(null);
  const theoryDone = cert.access !== 'training_required';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link to={`/equipment/${equipment.equipment_id}`} className="text-body-sm font-semibold text-pix-blue hover:underline">← {equipment.name}</Link>
      <PageHeader title={`Training · ${equipment.name}`} eyebrow={<span className="font-mono normal-case">{equipment.code}</span>}
        actions={<AccessBadge access={cert.access} />} />
      <Card><Stepper label="Certification progress" steps={steps(cert.access, phase === 'quiz' || result !== null)} /></Card>

      {result?.passed && (
        <Alert tone="success" title="Quiz passed">{`You scored ${result.score}% (${result.passing_score}% required).`}</Alert>
      )}

      {!theoryDone && (
        module.isPending ? <PageLoading label="Loading the quiz" />
          : module.isError ? (
            module.error instanceof ApiError && module.error.code === 'NOT_FOUND'
              ? <Alert tone="info" title="Training for this instrument isn't available yet">The facility has not published an SOP and quiz for it. Contact the facility staff.</Alert>
              : <ErrorState error={module.error} onRetry={() => void module.refetch()} />
          ) : phase === 'sop' ? <SopStep module={module.data} onContinue={() => setPhase('quiz')} />
          : <QuizStep module={module.data} onResult={setResult} />
      )}

      {theoryDone && <PracticalStep equipment={equipment} />}
    </div>
  );
}

function SopStep({ module, onContinue }: { module: TrainingModule; onContinue: () => void }) {
  const [read, setRead] = useState(false);
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-title text-title-sm">1 · Read the standard operating procedure</h2>
      <p className="text-body text-ink">The SOP explains safe operation of this instrument. You need it to pass the quiz ({module.passing_score}% required).</p>
      <a href={module.sop_document_url} target="_blank" rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-2 rounded-lg border-2 border-pix-blue px-4 py-2 font-semibold text-pix-blue hover:bg-pix-blue-10">
        Open the SOP <ExternalLink aria-hidden className="h-4 w-4" /><span className="sr-only">(opens in a new tab)</span>
      </a>
      <label className="flex items-center gap-3 text-body">
        <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="h-4 w-4 accent-pix-blue" />
        I have read and understood the SOP
      </label>
      <Button className="w-fit" disabled={!read} onClick={onContinue}>Start the quiz</Button>
    </Card>
  );
}

function QuizStep({ module, onResult }: { module: TrainingModule; onResult: (result: QuizResult) => void }) {
  const submit = useSubmitQuiz();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [incomplete, setIncomplete] = useState(false);
  const answered = Object.keys(answers).length;
  const failed = submit.data && !submit.data.passed ? submit.data : null;

  function send() {
    if (answered < module.questions.length) return setIncomplete(true);
    setIncomplete(false);
    submit.mutate(
      { module_id: module.module_id, answers: module.questions.map((q) => ({ question_id: q.question_id, selected_option: answers[q.question_id]! })) },
      { onSuccess: (result) => result.passed && onResult(result) },
    );
  }

  if (failed) {
    return (
      <Card className="flex flex-col gap-4">
        <Alert tone="warning" title="Not passed yet">{`You scored ${failed.score}% — you need ${failed.passing_score}% to pass. Review the SOP and try again.`}</Alert>
        <Button className="w-fit" onClick={() => { setAnswers({}); submit.reset(); }}>Try again</Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="font-title text-title-sm">2 · Safety quiz</h2>
      {submit.error && <Alert tone="danger" title="Your answers were not submitted">{submit.error.message}</Alert>}
      {module.questions.map((question, qIndex) => (
        <fieldset key={question.question_id} className="flex flex-col gap-2">
          <legend className="mb-1 text-body font-semibold text-ink">{qIndex + 1}. {question.prompt}</legend>
          {question.options.map((option, oIndex) => {
            const selected = answers[question.question_id] === oIndex;
            return (
              <label key={oIndex} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 text-body',
                selected ? 'border-pix-blue bg-surface-sunken' : 'border-line hover:border-pix-blue-50')}>
                <input type="radio" name={`question-${question.question_id}`} checked={selected} className="accent-pix-blue"
                  onChange={() => setAnswers((a) => ({ ...a, [question.question_id]: oIndex }))} />
                {option}
              </label>
            );
          })}
        </fieldset>
      ))}
      {incomplete && <p role="alert" className="text-body-sm text-danger">Answer every question before submitting ({answered} of {module.questions.length} answered).</p>}
      <Button className="w-fit" loading={submit.isPending} onClick={send}>Submit answers</Button>
    </Card>
  );
}

function PracticalStep({ equipment }: { equipment: EquipmentDetail }) {
  const cert = equipment.my_certification;
  const request = useRequestPractical(equipment.equipment_id);
  const requestButton = (
    <Button variant="attention" className="w-fit" loading={request.isPending} onClick={() => request.mutate()}>Request practical assessment</Button>
  );

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-title text-title-sm">3 · Practical assessment</h2>
      {request.error && <Alert tone="danger" title="The request was not sent">{request.error.message}</Alert>}
      {cert.access === 'assessment_required' && (
        <>
          <p className="text-body">A super user will observe you operating the instrument and sign off your certification.</p>
          {requestButton}
        </>
      )}
      {cert.access === 'reassessment_needed' && (
        <>
          <Alert tone="danger" title="Your last assessment was not approved">
            {cert.practical_rejection_reason ? <>Reviewer's note: {cert.practical_rejection_reason}</> : 'Ask the facility staff for feedback.'}
          </Alert>
          {requestButton}
        </>
      )}
      {cert.access === 'expired' && (
        <>
          <Alert tone="warning" title="Your certification has expired">
            {cert.expires_at && <>It expired on <span className="font-mono">{formatDate(cert.expires_at)}</span>. </>}Request a new practical assessment to renew it.
          </Alert>
          {requestButton}
        </>
      )}
      {cert.access === 'assessment_pending' && (
        <Alert tone="info" title="Assessment requested">Your request is waiting for a super user. You will be notified when it is decided.</Alert>
      )}
      {cert.access === 'certified' && (
        <Alert tone="success" title="You are certified for this instrument">
          {cert.expires_at ? <>Valid until <span className="font-mono">{formatDate(cert.expires_at)}</span>.</> : 'This certification does not expire.'}
        </Alert>
      )}
    </Card>
  );
}

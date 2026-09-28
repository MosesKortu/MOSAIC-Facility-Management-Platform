import { TrainingModuleBody, type AdminTrainingModule } from '@mosaic/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { TextField } from '../../components/ui/field.tsx';
import { useSaveTrainingModule } from './api.ts';

interface DraftQuestion { key: number; prompt: string; options: string[]; correct_option: number }
let nextKey = 0;
const blankQuestion = (): DraftQuestion => ({ key: nextKey++, prompt: '', options: ['', ''], correct_option: 0 });

/** Admin editor for an instrument's SOP link and quiz (the correct answers stay server-side). */
export function TrainingModuleEditor({ equipmentId, initial }: { equipmentId: string; initial: AdminTrainingModule | null }) {
  const save = useSaveTrainingModule(equipmentId);
  const [sop, setSop] = useState(initial?.sop_document_url ?? '');
  const [passing, setPassing] = useState(String(initial?.passing_score ?? 80));
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    initial ? initial.questions.map((q) => ({ key: nextKey++, prompt: q.prompt, options: q.options, correct_option: q.correct_option })) : [blankQuestion()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const change = (key: number, update: (q: DraftQuestion) => DraftQuestion) => {
    save.reset();
    setQuestions((current) => current.map((q) => (q.key === key ? update(q) : q)));
  };

  function submit() {
    const body = { sop_document_url: sop.trim(), passing_score: Number(passing), questions: questions.map(({ key: _key, ...q }) => q) };
    const parsed = TrainingModuleBody.safeParse(body);
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues) found[issue.path.join('.')] ??= issue.message;
      return setErrors(found);
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <div className="flex flex-col gap-4">
      {save.isSuccess && <Alert tone="success" title="Training saved.">Researchers see the new quiz immediately. Existing quiz passes are kept.</Alert>}
      {save.isError && <Alert tone="danger" title="The training was not saved">{save.error.message}</Alert>}
      {errors.questions && <Alert tone="danger" title={errors.questions} />}
      <Card className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <TextField label="SOP document link" type="url" placeholder="https://" value={sop} error={errors.sop_document_url}
          onChange={(e) => { save.reset(); setSop(e.target.value); }} />
        <TextField label="Passing score (%)" type="number" min={1} max={100} value={passing} error={errors.passing_score}
          onChange={(e) => { save.reset(); setPassing(e.target.value); }} />
      </Card>

      {questions.map((question, qIndex) => {
        const label = `Question ${qIndex + 1}`;
        return (
          <Card key={question.key} className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <TextField label={label} value={question.prompt} error={errors[`questions.${qIndex}.prompt`]}
                  onChange={(e) => change(question.key, (q) => ({ ...q, prompt: e.target.value }))} />
              </div>
              {questions.length > 1 && (
                <Button variant="ghost" size="sm" className="mt-6" aria-label={`Remove ${label.toLowerCase()}`}
                  onClick={() => setQuestions((current) => current.filter((q) => q.key !== question.key))}>
                  <Trash2 aria-hidden className="h-4 w-4" />
                </Button>
              )}
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="eyebrow mb-1">Options — mark the correct one</legend>
              {question.options.map((option, oIndex) => {
                const optionLabel = `${label}, option ${oIndex + 1}`;
                return (
                  <div key={oIndex} className="flex items-center gap-3">
                    <input type="radio" name={`correct-${question.key}`} aria-label={`${optionLabel} is correct`} className="h-4 w-4 accent-pix-blue"
                      checked={question.correct_option === oIndex} onChange={() => change(question.key, (q) => ({ ...q, correct_option: oIndex }))} />
                    <input aria-label={optionLabel} value={option} placeholder={`Option ${oIndex + 1}`}
                      onChange={(e) => change(question.key, (q) => ({ ...q, options: q.options.map((o, i) => (i === oIndex ? e.target.value : o)) }))}
                      className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-body outline-none focus:border-pix-blue" />
                    {question.options.length > 2 && (
                      <Button variant="ghost" size="sm" aria-label={`Remove ${optionLabel.toLowerCase()}`}
                        onClick={() => change(question.key, (q) => ({
                          ...q, options: q.options.filter((_, i) => i !== oIndex),
                          correct_option: q.correct_option === oIndex ? 0 : q.correct_option > oIndex ? q.correct_option - 1 : q.correct_option,
                        }))}>
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {(errors[`questions.${qIndex}.options.0`] ?? errors[`questions.${qIndex}.options.1`] ?? errors[`questions.${qIndex}.options`]) && (
                <p className="text-caption text-danger">{errors[`questions.${qIndex}.options.0`] ?? errors[`questions.${qIndex}.options.1`] ?? errors[`questions.${qIndex}.options`]}</p>
              )}
              {question.options.length < 6 && (
                <Button variant="ghost" size="sm" className="w-fit" onClick={() => change(question.key, (q) => ({ ...q, options: [...q.options, ''] }))}>
                  <Plus aria-hidden className="h-4 w-4" /> Add option
                </Button>
              )}
            </fieldset>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setQuestions((current) => [...current, blankQuestion()])}><Plus aria-hidden className="h-4 w-4" /> Add question</Button>
        <Button loading={save.isPending} onClick={submit}>Save training</Button>
      </div>
    </div>
  );
}

import { DomainError } from '../../http/errors.ts';

export interface StoredQuestion {
  question_id: number;
  prompt: string;
  options: string[];
  /** Never sent to clients. */
  correct_option: number;
}

/**
 * Scores a quiz attempt server-side (03 §4). Unanswered questions count as wrong; answers that do not
 * match the quiz are rejected rather than ignored, so a tampered submission cannot score.
 */
export function scoreQuiz(questions: StoredQuestion[], answers: { question_id: number; selected_option: number }[]) {
  const byId = new Map(questions.map((q) => [q.question_id, q]));
  const seen = new Set<number>();
  let correct = 0;
  answers.forEach((answer, index) => {
    const question = byId.get(answer.question_id);
    const invalid = (message: string) => new DomainError('VALIDATION_FAILED', 'The quiz answers do not match this quiz', {
      issues: [{ path: `answers.${index}`, message }],
    });
    if (!question) throw invalid('Unknown question');
    if (seen.has(answer.question_id)) throw invalid('Question answered twice');
    if (answer.selected_option >= question.options.length) throw invalid('No such option');
    seen.add(answer.question_id);
    if (answer.selected_option === question.correct_option) correct += 1;
  });
  return { correct, total: questions.length, score: Math.round((correct / questions.length) * 100) };
}

import { describe, expect, it } from 'vitest';
import { scoreQuiz } from './scoring.ts';

const questions = [
  { question_id: 1, prompt: 'a', options: ['x', 'y'], correct_option: 1 },
  { question_id: 2, prompt: 'b', options: ['x', 'y', 'z'], correct_option: 0 },
  { question_id: 3, prompt: 'c', options: ['x', 'y'], correct_option: 0 },
];

describe('scoreQuiz', () => {
  it('scores the share of correct answers as a whole percentage', () => {
    expect(scoreQuiz(questions, [
      { question_id: 1, selected_option: 1 }, { question_id: 2, selected_option: 0 }, { question_id: 3, selected_option: 1 },
    ])).toEqual({ correct: 2, total: 3, score: 67 });
  });

  it('counts unanswered questions as wrong', () => {
    expect(scoreQuiz(questions, [{ question_id: 1, selected_option: 1 }])).toEqual({ correct: 1, total: 3, score: 33 });
  });

  it('rejects answers to unknown questions, duplicates and out-of-range options', () => {
    for (const answers of [
      [{ question_id: 9, selected_option: 0 }],
      [{ question_id: 1, selected_option: 1 }, { question_id: 1, selected_option: 0 }],
      [{ question_id: 1, selected_option: 5 }],
    ]) {
      expect(() => scoreQuiz(questions, answers)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    }
  });
});

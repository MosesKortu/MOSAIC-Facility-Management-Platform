import { z } from 'zod';
import type { PersonRef } from './admin.ts';
import type { AccessState, Facility } from './equipment.ts';
import { FACILITIES } from './equipment.ts';

/** Training modules, quizzes and practical certification (08 §23–24, 03 §3–4). */

/** GET /training/:equipment_id — the quiz without its answers. */
export interface TrainingModule {
  module_id: string;
  equipment_id: string;
  equipment_code: string;
  equipment_name: string;
  sop_document_url: string;
  passing_score: number;
  questions: { question_id: number; prompt: string; options: string[] }[];
}

export const SubmitQuizBody = z.object({
  module_id: z.string().uuid(),
  answers: z.array(z.object({ question_id: z.number().int().min(1), selected_option: z.number().int().min(0) })).min(1).max(100),
});
export type SubmitQuizBody = z.infer<typeof SubmitQuizBody>;

export interface QuizResult {
  score: number;
  passed: boolean;
  passing_score: number;
  correct: number;
  total: number;
  /** true when the theory stage was already passed before this attempt (retakes never revoke it). */
  already_passed: boolean;
}

/** One of the caller's certification records (GET /certifications/me). */
export interface MyCertificationRecord {
  cert_id: string;
  equipment_id: string;
  equipment_code: string;
  equipment_name: string;
  facility: Facility;
  access: AccessState;
  theoretical_passed: boolean;
  theoretical_score: number | null;
  theoretical_passed_at: string | null;
  practical_status: 'not_requested' | 'pending' | 'signed_off' | 'rejected';
  practical_requested_at: string | null;
  practical_signed_off_at: string | null;
  practical_rejection_reason: string | null;
  expires_at: string | null;
}

// ─── Operations: practical assessment queue ─────────────────────────────────────────────────────

export const PendingQuery = z.object({
  facility: z.enum(FACILITIES).optional(),
  equipment_id: z.string().uuid().optional(),
});
export type PendingQuery = z.infer<typeof PendingQuery>;

export interface PendingAssessment {
  cert_id: string;
  user: PersonRef & { user_type: 'internal' | 'external' };
  equipment: { equipment_id: string; code: string; name: string; facility: Facility };
  theoretical_score: number | null;
  practical_requested_at: string;
}

export const DecisionBody = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('signed_off'), reason: z.string().trim().max(2000).nullish() }),
  z.object({ decision: z.literal('rejected'), reason: z.string().trim().max(2000) }),
]);
export type DecisionBody = z.infer<typeof DecisionBody>;

// ─── Administration: module editor ──────────────────────────────────────────────────────────────

export const TrainingModuleBody = z.object({
  sop_document_url: z.string().trim().url('Enter the full address of the SOP, starting with https://')
    .refine((u) => u.startsWith('https://'), 'Use a secure https:// address'),
  passing_score: z.number().int().min(1).max(100),
  questions: z.array(z.object({
    prompt: z.string().trim().min(1, 'Write the question').max(1000),
    options: z.array(z.string().trim().min(1, 'Options cannot be empty').max(500)).min(2, 'Give at least two options').max(6),
    correct_option: z.number().int().min(0),
  }).refine((q) => q.correct_option < q.options.length, { path: ['correct_option'], message: 'Choose the correct option' }))
    .min(1, 'Add at least one question').max(50),
});
export type TrainingModuleBody = z.infer<typeof TrainingModuleBody>;

/** Admin view of a module, including the correct answers. */
export interface AdminTrainingModule {
  module_id: string;
  equipment_id: string;
  sop_document_url: string;
  passing_score: number;
  questions: { question_id: number; prompt: string; options: string[]; correct_option: number }[];
}

import type {
  AdminTrainingModule, DecisionBody, MyCertificationRecord, PendingAssessment, PendingQuery, QuizResult, SubmitQuizBody,
  TrainingModule, TrainingModuleBody,
} from '@mosaic/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.ts';
import { toQueryString } from '../../lib/query-string.ts';

export const trainingKeys = {
  module: (equipmentId: string) => ['training', 'module', equipmentId] as const,
  adminModule: (equipmentId: string) => ['training', 'admin-module', equipmentId] as const,
  mine: ['certifications', 'me'] as const,
  pending: (query: PendingQuery) => ['certifications', 'pending', query] as const,
};

export function useTrainingModule(equipmentId: string) {
  return useQuery({
    queryKey: trainingKeys.module(equipmentId),
    queryFn: ({ signal }) => apiFetch<TrainingModule>(`/training/${equipmentId}`, { signal }),
  });
}

export function useMyCertifications() {
  return useQuery({ queryKey: trainingKeys.mine, queryFn: ({ signal }) => apiFetch<MyCertificationRecord[]>('/certifications/me', { signal }) });
}

/** Certification changes show on equipment pages (my access) and the training list. */
function useInvalidateAccess() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ['equipment'] }),
    client.invalidateQueries({ queryKey: ['certifications'] }),
  ]);
}

export function useSubmitQuiz() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: (body: SubmitQuizBody) => apiFetch<QuizResult>('/training/submit-quiz', { method: 'POST', body }),
    onSuccess: () => invalidate(),
  });
}

export function useRequestPractical(equipmentId: string) {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: () => apiFetch<MyCertificationRecord>(`/certifications/${equipmentId}/request-practical`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  });
}

export function usePendingAssessments(query: PendingQuery) {
  return useQuery({
    queryKey: trainingKeys.pending(query),
    queryFn: ({ signal }) => apiFetch<PendingAssessment[]>(`/certifications/pending${toQueryString(query)}`, { signal }),
  });
}

export function useDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ certId, body }: { certId: string; body: DecisionBody }) =>
      apiFetch<MyCertificationRecord>(`/certifications/${certId}/decision`, { method: 'POST', body }),
    // Refresh the queue on success and on ALREADY_ACTIONED alike: either way the request has left it.
    onSettled: () => client.invalidateQueries({ queryKey: ['certifications'] }),
  });
}

export function useAdminTrainingModule(equipmentId: string) {
  return useQuery({
    queryKey: trainingKeys.adminModule(equipmentId),
    queryFn: ({ signal }) => apiFetch<AdminTrainingModule>(`/admin/equipment/${equipmentId}/training-module`, { signal }),
  });
}

export function useSaveTrainingModule(equipmentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TrainingModuleBody) =>
      apiFetch<AdminTrainingModule>(`/admin/equipment/${equipmentId}/training-module`, { method: 'PUT', body }),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ['training'] }),
      client.invalidateQueries({ queryKey: ['audit'] }),
    ]),
  });
}

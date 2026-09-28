import type { BadgeTone } from '../../components/ui/badge.tsx';

export function activeBadge(isActive: boolean): { tone: BadgeTone; label: string } {
  return isActive ? { tone: 'success', label: 'Active' } : { tone: 'neutral', label: 'Inactive' };
}

export const PRACTICAL_LABEL = {
  not_requested: { tone: 'warning', label: 'Assessment not requested' },
  pending: { tone: 'warning', label: 'Assessment pending' },
  signed_off: { tone: 'success', label: 'Certified' },
  rejected: { tone: 'danger', label: 'Reassessment needed' },
} as const satisfies Record<string, { tone: BadgeTone; label: string }>;

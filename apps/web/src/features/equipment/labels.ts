import type { AccessState, EquipmentStatus, SupportTier } from '@mosaic/contracts';
import type { BadgeTone } from '../../components/ui/badge.tsx';

/** Domain state language (04_DESIGN_SYSTEM.md §5): each persisted state has one label and tone. */
export const EQUIPMENT_STATUS: Record<EquipmentStatus, { label: string; tone: BadgeTone; phrase: string }> = {
  operational: { label: 'Operational', tone: 'success', phrase: 'operational' },
  maintenance: { label: 'Maintenance', tone: 'warning', phrase: 'under maintenance' },
  offline: { label: 'Offline', tone: 'danger', phrase: 'offline' },
};

export const ACCESS: Record<AccessState, { label: string; tone: BadgeTone; next: string }> = {
  certified: { label: 'Certified', tone: 'success', next: 'You can book this instrument.' },
  training_required: { label: 'Training required', tone: 'warning', next: 'Read the SOP and pass the safety quiz for this instrument.' },
  assessment_required: { label: 'Request assessment', tone: 'warning', next: 'You passed the quiz. Next, request a practical assessment.' },
  assessment_pending: { label: 'Assessment pending', tone: 'warning', next: 'Your practical assessment is waiting for a super user.' },
  reassessment_needed: { label: 'Reassessment needed', tone: 'danger', next: 'Your practical assessment was not approved. Request a new one.' },
  expired: { label: 'Certification expired', tone: 'danger', next: 'Your certification has expired. Renew it before booking.' },
};

export const SUPPORT_TIER_LABEL: Record<SupportTier, string> = {
  none: 'Autonomous',
  technician: 'Technician support',
  supervisor: 'Supervisor support',
};

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

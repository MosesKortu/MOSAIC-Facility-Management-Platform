import type { AccessState } from '@mosaic/contracts';

export interface CertificationFacts {
  theoretical_passed: boolean;
  practical_status: 'not_requested' | 'pending' | 'signed_off' | 'rejected';
  expires_at: Date | null;
}

/**
 * The single definition of a user's access to an instrument (contracts AccessState). Equipment pages
 * show it; the booking gate enforces it. Expiry is exclusive: at `expires_at` access has ended.
 */
export function accessState(cert: CertificationFacts | null, now: Date): AccessState {
  if (!cert || !cert.theoretical_passed) return 'training_required';
  switch (cert.practical_status) {
    case 'not_requested':
      return 'assessment_required';
    case 'pending':
      return 'assessment_pending';
    case 'rejected':
      return 'reassessment_needed';
    case 'signed_off':
      return cert.expires_at !== null && cert.expires_at.getTime() <= now.getTime() ? 'expired' : 'certified';
  }
}

/**
 * The single catalog of machine-readable error codes (03_API_SPEC.md §0.3). The API maps a thrown
 * DomainError's code to its HTTP status here; the web app maps the same code to an actionable UI state.
 */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  USER_INACTIVE: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,

  // Booking gates, in evaluation order (03_API_SPEC.md §3.1)
  PROXY_NOT_PERMITTED: 403,
  INVALID_DURATION: 422,
  BOOKING_IN_PAST: 422,
  OUTSIDE_AVAILABILITY: 422,
  EQUIPMENT_NOT_OPERATIONAL: 403,
  SUPPORT_UNAVAILABLE: 422,
  CERTIFICATION_REQUIRED: 403,
  PRACTICAL_CERTIFICATION_PENDING: 403,
  CERTIFICATION_EXPIRED: 403,
  ALLOCATION_NOT_AVAILABLE: 403,
  GRANT_EXPIRED: 403,
  BOOKING_CONFLICT: 409,
  INSUFFICIENT_GRANT_BALANCE: 402,

  // Booking lifecycle
  SLOT_ALREADY_STARTED: 409,
  BOOKING_NOT_CANCELLABLE: 409,
  REASON_REQUIRED: 400,

  // Certification
  THEORY_INCOMPLETE: 403,
  PRACTICAL_REQUEST_EXISTS: 409,
  ALREADY_ACTIONED: 409,

  // Sessions
  SESSION_NOT_STARTABLE: 409,
  SESSION_NOT_ACTIVE: 409,

  // Administration
  OVER_ALLOCATION: 409,
  ALLOCATION_BELOW_CONSUMED: 409,
  BUDGET_BELOW_ALLOCATED: 409,
  DUPLICATE: 409,
  INVALID_SPONSOR: 422,
  ROLE_NOT_ALLOWED_FOR_EXTERNAL: 422,
  SELF_LOCKOUT: 409,
  WINDOW_OVERLAP: 422,
  STATUS_UNCHANGED: 409,
  GROUP_INACTIVE: 409,
  INVALID_PI: 422,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;

export function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_STATUS, value);
}

/** Wire shape of every non-2xx response. */
export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
  request_id: string;
}

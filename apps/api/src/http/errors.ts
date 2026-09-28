import { ERROR_STATUS, type ErrorCode, type ErrorEnvelope } from '@mosaic/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** A business-rule failure with a catalog code (03_API_SPEC.md §0.3). Services throw these. */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

function send(reply: FastifyReply, request: FastifyRequest, error: DomainError) {
  const body: ErrorEnvelope = {
    error: { code: error.code, message: error.message, ...(error.details && { details: error.details }) },
    request_id: request.id,
  };
  return reply.status(ERROR_STATUS[error.code]).send(body);
}

/** One place that turns any thrown value into the error envelope. */
export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | DomainError, request, reply) => {
    if (error instanceof DomainError) return send(reply, request, error);

    // Fastify's own client errors (malformed JSON, unsupported media type, body too large).
    if ('statusCode' in error && error.statusCode !== undefined && error.statusCode < 500) {
      return send(reply, request, new DomainError('VALIDATION_FAILED', 'The request could not be parsed'));
    }

    request.log.error({ err: error }, 'unhandled error');
    return send(reply, request, new DomainError('INTERNAL_ERROR', 'Something went wrong on our side'));
  });

  app.setNotFoundHandler((request, reply) =>
    send(reply, request, new DomainError('NOT_FOUND', 'No such endpoint', { entity: 'route' })),
  );
}

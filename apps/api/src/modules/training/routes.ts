import { DecisionBody, PendingQuery, SubmitQuizBody, TrainingModuleBody } from '@mosaic/contracts';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { ADMIN, RESEARCHERS, STAFF } from '../../http/access.ts';
import { parseId } from '../../http/params.ts';
import { parseWith } from '../../http/validation.ts';
import * as service from './service.ts';

export function registerTrainingRoutes(app: FastifyInstance, pool: pg.Pool) {
  const equipmentId = (params: unknown) => parseId(params, 'equipmentId', 'equipment');
  const researchers = { config: { access: RESEARCHERS } };
  const staff = { config: { access: STAFF } };

  app.get('/api/v1/training/:equipmentId', researchers, async (request) => service.getTrainingModule(pool, equipmentId(request.params)));
  app.post('/api/v1/training/submit-quiz', researchers, async (request) =>
    service.submitQuiz(pool, request.actor!, parseWith(SubmitQuizBody, request.body)));

  app.get('/api/v1/certifications/me', researchers, async (request) => service.myCertifications(pool, request.actor!));
  app.post('/api/v1/certifications/:equipmentId/request-practical', researchers, async (request, reply) =>
    reply.status(201).send(await service.requestPractical(pool, request.actor!, equipmentId(request.params))));

  app.get('/api/v1/certifications/pending', staff, async (request) => service.pendingAssessments(pool, parseWith(PendingQuery, request.query)));
  app.post('/api/v1/certifications/:certId/decision', staff, async (request) =>
    service.decide(pool, request.actor!, parseId(request.params, 'certId', 'certification'), parseWith(DecisionBody, request.body)));

  const admin = { config: { access: ADMIN } };
  app.get('/api/v1/admin/equipment/:equipmentId/training-module', admin, async (request) =>
    service.getAdminTrainingModule(pool, equipmentId(request.params)));
  app.put('/api/v1/admin/equipment/:equipmentId/training-module', admin, async (request) =>
    service.saveTrainingModule(pool, request.actor!, equipmentId(request.params), parseWith(TrainingModuleBody, request.body)));
}

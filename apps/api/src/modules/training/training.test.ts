import { beforeEach, describe, expect, it } from 'vitest';
import { as, createTestApp, loginAs } from '../../../test/app.ts';
import { resetDatabase, testPool as db } from '../../../test/db.ts';
import { auditFor, insertCertification, insertEquipment, insertUser, type UserRow } from '../../../test/fixtures.ts';

const app = createTestApp();
let researcher: UserRow;
let cookie: string;
let adminCookie: string;
let equipment: string;

const module = {
  sop_document_url: 'https://docs.icfo.test/sop/ebl-crestec-v3.pdf',
  passing_score: 80,
  questions: [
    { prompt: 'What must you verify before starting?', options: ['Sample only', 'Status, PPE and sample compatibility'], correct_option: 1 },
    { prompt: 'Maximum exposure without supervision?', options: ['2 h', 'None'], correct_option: 0 },
  ],
};

beforeEach(async () => {
  await resetDatabase();
  researcher = await insertUser(db, { email: 'anna@icfo.test', full_name: 'Anna Kowalski' });
  await insertUser(db, { email: 'admin@icfo.test', role: 'admin' });
  cookie = await loginAs(app, 'anna@icfo.test');
  adminCookie = await loginAs(app, 'admin@icfo.test');
  equipment = await insertEquipment(db, { code: 'EBL_CRESTEC' });
  await db.query('UPDATE equipment SET certification_validity_months = 24 WHERE equipment_id = $1', [equipment]);
});

const setModule = () => as(app, adminCookie, { method: 'PUT', url: `/api/v1/admin/equipment/${equipment}/training-module`, payload: module });
const answer = (moduleId: string, first: number, second: number) => as(app, cookie, {
  method: 'POST', url: '/api/v1/training/submit-quiz',
  payload: { module_id: moduleId, answers: [{ question_id: 1, selected_option: first }, { question_id: 2, selected_option: second }] },
});
const requestPractical = (c = cookie) => as(app, c, { method: 'POST', url: `/api/v1/certifications/${equipment}/request-practical` });

describe('training modules', () => {
  it('lets admins define the quiz and never reveals answers to researchers', async () => {
    const saved = await setModule();
    expect(saved.statusCode).toBe(200);
    expect(saved.json().questions).toEqual([
      expect.objectContaining({ question_id: 1, correct_option: 1 }), expect.objectContaining({ question_id: 2, correct_option: 0 }),
    ]);
    expect((await auditFor(db, saved.json().module_id)).map((a) => a.action)).toEqual(['training_module.saved']);

    const res = await as(app, cookie, { method: 'GET', url: `/api/v1/training/${equipment}` });
    expect(res.json()).toMatchObject({ equipment_code: 'EBL_CRESTEC', passing_score: 80, sop_document_url: module.sop_document_url });
    expect(res.body).not.toContain('correct_option');
  });

  it('reports a missing module as not found', async () => {
    const res = await as(app, cookie, { method: 'GET', url: `/api/v1/training/${equipment}` });
    expect(res.json().error).toMatchObject({ code: 'NOT_FOUND', details: { entity: 'training module' } });
  });

  it('rejects an insecure SOP link and a correct option that does not exist', async () => {
    const res = await as(app, adminCookie, { method: 'PUT', url: `/api/v1/admin/equipment/${equipment}/training-module`, payload: {
      ...module, sop_document_url: 'http://docs.icfo.test/sop.pdf', questions: [{ prompt: 'q', options: ['a', 'b'], correct_option: 2 }],
    } });
    expect(res.json().error.details.issues.map((i: { path: string }) => i.path).sort()).toEqual(['questions.0.correct_option', 'sop_document_url']);
  });
});

describe('quiz', () => {
  it('scores server-side; a pass records the theory stage and retakes never revoke it', async () => {
    const moduleId = (await setModule()).json().module_id;
    const failed = await answer(moduleId, 0, 0);
    expect(failed.json()).toEqual({ score: 50, passed: false, passing_score: 80, correct: 1, total: 2, already_passed: false });

    const passed = await answer(moduleId, 1, 0);
    expect(passed.json()).toMatchObject({ score: 100, passed: true, already_passed: false });

    const retake = await answer(moduleId, 0, 1);
    expect(retake.json()).toMatchObject({ passed: false, already_passed: true });
    const { rows } = await db.query('SELECT theoretical_passed, theoretical_score FROM user_certifications WHERE user_id = $1', [researcher.user_id]);
    expect(rows[0]).toEqual({ theoretical_passed: true, theoretical_score: 100 });
  });
});

describe('practical certification', () => {
  let techCookie: string;
  beforeEach(async () => {
    await insertUser(db, { email: 'tech@icfo.test', role: 'super_user', full_name: 'Marc Tech' });
    techCookie = await loginAs(app, 'tech@icfo.test');
  });

  it('requires the theory stage before a practical request', async () => {
    expect((await requestPractical()).json().error.code).toBe('THEORY_INCOMPLETE');
  });

  it('queues a request oldest first, and refuses a second pending request', async () => {
    await insertCertification(db, researcher.user_id, equipment, { practical_status: 'not_requested' });
    const other = await insertUser(db, { email: 'other@icfo.test', full_name: 'Other Person' });
    const second = await insertEquipment(db, { code: 'SLN_STED', facility: 'SLN' });
    await insertCertification(db, other.user_id, second, { practical_status: 'not_requested' });

    expect((await requestPractical()).statusCode).toBe(201);
    expect((await requestPractical()).json().error.code).toBe('PRACTICAL_REQUEST_EXISTS');
    await as(app, await loginAs(app, 'other@icfo.test'), { method: 'POST', url: `/api/v1/certifications/${second}/request-practical` });

    const queue = await as(app, techCookie, { method: 'GET', url: '/api/v1/certifications/pending' });
    expect(queue.json().map((p: { user: { full_name: string } }) => p.user.full_name)).toEqual(['Anna Kowalski', 'Other Person']);
    const sln = await as(app, techCookie, { method: 'GET', url: '/api/v1/certifications/pending?facility=SLN' });
    expect(sln.json()).toHaveLength(1);
    expect((await as(app, cookie, { method: 'GET', url: '/api/v1/certifications/pending' })).statusCode).toBe(403);
  });

  it('signs off with an expiry from the instrument, audits it and notifies the requester', async () => {
    await insertCertification(db, researcher.user_id, equipment, { practical_status: 'not_requested' });
    const certId = (await requestPractical()).json().cert_id;
    const res = await as(app, techCookie, { method: 'POST', url: `/api/v1/certifications/${certId}/decision`, payload: { decision: 'signed_off' } });

    expect(res.json()).toMatchObject({ practical_status: 'signed_off', access: 'certified' });
    const months = (new Date(res.json().expires_at).getTime() - new Date(res.json().practical_signed_off_at).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    expect(Math.round(months)).toBe(24);
    expect((await auditFor(db, certId)).map((a) => a.action)).toEqual(['certification.signed_off']);
    const { rows } = await db.query('SELECT user_id, type, payload FROM notifications');
    expect(rows).toEqual([{ user_id: researcher.user_id, type: 'certification_signed_off', payload: {
      equipment_id: equipment, equipment_code: 'EBL_CRESTEC', equipment_name: expect.any(String), expires_at: res.json().expires_at,
    } }]);
  });

  it('rejects only with a reason, and allows a new request afterwards', async () => {
    await insertCertification(db, researcher.user_id, equipment, { practical_status: 'not_requested' });
    const certId = (await requestPractical()).json().cert_id;
    const decide = (payload: object) => as(app, techCookie, { method: 'POST', url: `/api/v1/certifications/${certId}/decision`, payload });

    expect((await decide({ decision: 'rejected', reason: '  ' })).json().error.code).toBe('REASON_REQUIRED');
    const rejected = await decide({ decision: 'rejected', reason: 'Needs another supervised run' });
    expect(rejected.json()).toMatchObject({ practical_status: 'rejected', access: 'reassessment_needed', practical_rejection_reason: 'Needs another supervised run' });
    expect((await requestPractical()).json()).toMatchObject({ practical_status: 'pending', practical_rejection_reason: null });
  });

  it('lets only one of two concurrent reviewers action a request', async () => {
    await insertUser(db, { email: 'tech2@icfo.test', role: 'super_user' });
    const tech2 = await loginAs(app, 'tech2@icfo.test');
    await insertCertification(db, researcher.user_id, equipment, { practical_status: 'not_requested' });
    const certId = (await requestPractical()).json().cert_id;
    const results = await Promise.all([techCookie, tech2].map((c, i) => as(app, c, {
      method: 'POST', url: `/api/v1/certifications/${certId}/decision`,
      payload: i === 0 ? { decision: 'signed_off' } : { decision: 'rejected', reason: 'Not yet' },
    })));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json().error.code).toBe('ALREADY_ACTIONED');
    expect((await auditFor(db, certId))).toHaveLength(1);
  });

  it('does not let a super user assess their own request', async () => {
    const tech = (await db.query("SELECT user_id FROM users WHERE email = 'tech@icfo.test'")).rows[0].user_id;
    await insertCertification(db, tech, equipment, { practical_status: 'not_requested' });
    const certId = (await requestPractical(techCookie)).json().cert_id;
    const res = await as(app, techCookie, { method: 'POST', url: `/api/v1/certifications/${certId}/decision`, payload: { decision: 'signed_off' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('lets an expired certification be renewed with a new practical request', async () => {
    await insertCertification(db, researcher.user_id, equipment, { expires_at: '2020-01-01T00:00:00Z' });
    expect((await requestPractical()).json()).toMatchObject({ practical_status: 'pending', access: 'assessment_pending' });
  });

  it('lists my certifications with their access state', async () => {
    await insertCertification(db, researcher.user_id, equipment, { practical_status: 'pending' });
    const res = await as(app, cookie, { method: 'GET', url: '/api/v1/certifications/me' });
    expect(res.json()).toMatchObject([{ equipment_code: 'EBL_CRESTEC', access: 'assessment_pending', facility: 'NFL' }]);
  });
});

import type {
  AdminTrainingModule, DecisionBody, LocalizedText, MyCertificationRecord, PendingAssessment, PendingQuery, QuizResult, SubmitQuizBody,
  TrainingModule, TrainingModuleBody,
} from '@mosaic/contracts';
import type pg from 'pg';
import { withTransaction, type Queryable } from '../../db/pool.ts';
import type { Actor } from '../../http/access.ts';
import { DomainError } from '../../http/errors.ts';
import { notFound } from '../../http/params.ts';
import { recordAudit } from '../audit/service.ts';
import { accessState } from '../certifications/access.ts';
import { notify } from '../notifications/service.ts';
import { scoreQuiz, type StoredQuestion } from './scoring.ts';

/**
 * Training (SOP + quiz) and practical certification (08 §23–24). Rules beyond the docs, recorded in
 * 09_ARCHITECTURE.md D18: passing the quiz is permanent (retakes never revoke it); an expired
 * certification is renewed with a new practical assessment; nobody assesses their own request.
 */

// ─── Modules ───────────────────────────────────────────────────────────────────────────────────

interface ModuleRow {
  module_id: string;
  equipment_id: string;
  equipment_code: string;
  equipment_name: string;
  sop_document_url: string;
  passing_score: number;
  quiz_schema: StoredQuestion[];
}

async function findModule(db: Queryable, where: 'equipment' | 'module', id: string): Promise<ModuleRow | null> {
  const { rows } = await db.query<ModuleRow>(
    `SELECT m.module_id, m.equipment_id, e.code AS equipment_code, e.name->>'en' AS equipment_name,
            m.sop_document_url, m.passing_score, m.quiz_schema
     FROM training_modules m JOIN equipment e ON e.equipment_id = m.equipment_id
     WHERE ${where === 'equipment' ? 'm.equipment_id' : 'm.module_id'} = $1 AND e.is_active`,
    [id],
  );
  return rows[0] ?? null;
}

/** The quiz for researchers: the correct answers never leave the server. */
export async function getTrainingModule(db: Queryable, equipmentId: string): Promise<TrainingModule> {
  const row = await findModule(db, 'equipment', equipmentId);
  if (!row) throw notFound('training module');
  const { quiz_schema, ...module } = row;
  return { ...module, questions: quiz_schema.map(({ question_id, prompt, options }) => ({ question_id, prompt, options })) };
}

export async function getAdminTrainingModule(db: Queryable, equipmentId: string): Promise<AdminTrainingModule> {
  const row = await findModule(db, 'equipment', equipmentId);
  if (!row) throw notFound('training module');
  return { module_id: row.module_id, equipment_id: row.equipment_id, sop_document_url: row.sop_document_url, passing_score: row.passing_score, questions: row.quiz_schema };
}

/** Creates or replaces an instrument's module. Existing theory passes are kept. */
export async function saveTrainingModule(pool: pg.Pool, actor: Actor, equipmentId: string, body: TrainingModuleBody): Promise<AdminTrainingModule> {
  const questions: StoredQuestion[] = body.questions.map((q, index) => ({ question_id: index + 1, ...q }));
  await withTransaction(pool, async (tx) => {
    const equipment = await tx.query('SELECT 1 FROM equipment WHERE equipment_id = $1 FOR UPDATE', [equipmentId]);
    if (equipment.rowCount === 0) throw notFound('equipment');
    const before = await tx.query<{ sop_document_url: string; passing_score: number; quiz_schema: StoredQuestion[] }>(
      'SELECT sop_document_url, passing_score, quiz_schema FROM training_modules WHERE equipment_id = $1', [equipmentId]);
    const { rows } = await tx.query<{ module_id: string }>(
      `INSERT INTO training_modules (equipment_id, sop_document_url, passing_score, quiz_schema) VALUES ($1, $2, $3, $4)
       ON CONFLICT (equipment_id) DO UPDATE SET sop_document_url = EXCLUDED.sop_document_url,
         passing_score = EXCLUDED.passing_score, quiz_schema = EXCLUDED.quiz_schema
       RETURNING module_id`,
      [equipmentId, body.sop_document_url, body.passing_score, JSON.stringify(questions)],
    );
    await recordAudit(tx, {
      actorUserId: actor.userId, action: 'training_module.saved', entityType: 'training_module', entityId: rows[0]!.module_id,
      before: before.rows[0] ?? null, after: { sop_document_url: body.sop_document_url, passing_score: body.passing_score, quiz_schema: questions },
    });
  });
  return getAdminTrainingModule(pool, equipmentId);
}

// ─── Quiz ──────────────────────────────────────────────────────────────────────────────────────

export async function submitQuiz(pool: pg.Pool, actor: Actor, body: SubmitQuizBody): Promise<QuizResult> {
  const module = await findModule(pool, 'module', body.module_id);
  if (!module) throw notFound('training module');
  const { correct, total, score } = scoreQuiz(module.quiz_schema, body.answers);
  const passed = score >= module.passing_score;

  return withTransaction(pool, async (tx) => {
    const { rows } = await tx.query<{ theoretical_passed: boolean }>(
      'SELECT theoretical_passed FROM user_certifications WHERE user_id = $1 AND equipment_id = $2 FOR UPDATE',
      [actor.userId, module.equipment_id],
    );
    const alreadyPassed = rows[0]?.theoretical_passed ?? false;
    if (!alreadyPassed) {
      await tx.query(
        `INSERT INTO user_certifications (user_id, equipment_id, theoretical_passed, theoretical_score, theoretical_passed_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $3 THEN now() END)
         ON CONFLICT (user_id, equipment_id) DO UPDATE SET theoretical_passed = EXCLUDED.theoretical_passed,
           theoretical_score = EXCLUDED.theoretical_score, theoretical_passed_at = EXCLUDED.theoretical_passed_at`,
        [actor.userId, module.equipment_id, passed, score],
      );
    }
    return { score, passed, passing_score: module.passing_score, correct, total, already_passed: alreadyPassed };
  });
}

// ─── Certifications ────────────────────────────────────────────────────────────────────────────

type CertRow = Omit<MyCertificationRecord, 'access' | 'expires_at' | 'theoretical_passed_at' | 'practical_requested_at' | 'practical_signed_off_at'> & {
  expires_at: Date | null; theoretical_passed_at: Date | null; practical_requested_at: Date | null; practical_signed_off_at: Date | null;
};

const CERT_SELECT = `SELECT c.cert_id, c.equipment_id, e.code AS equipment_code, e.name->>'en' AS equipment_name, e.facility,
  c.theoretical_passed, c.theoretical_score, c.theoretical_passed_at, c.practical_status, c.practical_requested_at,
  c.practical_signed_off_at, c.practical_rejection_reason, c.expires_at
  FROM user_certifications c JOIN equipment e ON e.equipment_id = c.equipment_id`;

function toRecord(row: CertRow, now = new Date()): MyCertificationRecord {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    ...row,
    access: accessState(row, now),
    theoretical_passed_at: iso(row.theoretical_passed_at),
    practical_requested_at: iso(row.practical_requested_at),
    practical_signed_off_at: iso(row.practical_signed_off_at),
    expires_at: iso(row.expires_at),
  };
}

async function certById(db: Queryable, certId: string): Promise<MyCertificationRecord> {
  const { rows } = await db.query<CertRow>(`${CERT_SELECT} WHERE c.cert_id = $1`, [certId]);
  return toRecord(rows[0]!);
}

export async function myCertifications(db: Queryable, actor: Actor): Promise<MyCertificationRecord[]> {
  const { rows } = await db.query<CertRow>(`${CERT_SELECT} WHERE c.user_id = $1 AND e.is_active ORDER BY e.facility, e.code`, [actor.userId]);
  const now = new Date();
  return rows.map((row) => toRecord(row, now));
}

export async function requestPractical(pool: pg.Pool, actor: Actor, equipmentId: string): Promise<MyCertificationRecord> {
  const certId = await withTransaction(pool, async (tx) => {
    const { rows } = await tx.query<{ cert_id: string; theoretical_passed: boolean; practical_status: string; expires_at: Date | null }>(
      `SELECT c.cert_id, c.theoretical_passed, c.practical_status, c.expires_at
       FROM user_certifications c JOIN equipment e ON e.equipment_id = c.equipment_id
       WHERE c.user_id = $1 AND c.equipment_id = $2 AND e.is_active FOR UPDATE OF c`,
      [actor.userId, equipmentId],
    );
    const cert = rows[0];
    if (!cert?.theoretical_passed) {
      throw new DomainError('THEORY_INCOMPLETE', 'Pass the safety quiz before requesting a practical assessment');
    }
    const stillCertified = cert.practical_status === 'signed_off' && (cert.expires_at === null || cert.expires_at > new Date());
    if (cert.practical_status === 'pending' || stillCertified) {
      throw new DomainError('PRACTICAL_REQUEST_EXISTS', stillCertified
        ? 'You are already certified for this instrument'
        : 'Your practical assessment request is already waiting for a super user');
    }
    await tx.query(
      `UPDATE user_certifications SET practical_status = 'pending', practical_requested_at = now(),
         practical_rejection_reason = NULL, practical_rejected_at = NULL
       WHERE cert_id = $1`,
      [cert.cert_id],
    );
    return cert.cert_id;
  });
  return certById(pool, certId);
}

export async function pendingAssessments(db: Queryable, query: PendingQuery): Promise<PendingAssessment[]> {
  const { rows } = await db.query<PendingAssessment>(
    `SELECT c.cert_id, c.theoretical_score, c.practical_requested_at,
            json_build_object('user_id', u.user_id, 'full_name', u.full_name, 'email', u.email, 'user_type', u.user_type) AS user,
            json_build_object('equipment_id', e.equipment_id, 'code', e.code, 'name', e.name->>'en', 'facility', e.facility) AS equipment
     FROM user_certifications c
     JOIN users u ON u.user_id = c.user_id
     JOIN equipment e ON e.equipment_id = c.equipment_id
     WHERE c.practical_status = 'pending' AND e.is_active AND u.is_active
       AND ($1::facility_code IS NULL OR e.facility = $1) AND ($2::uuid IS NULL OR e.equipment_id = $2)
     ORDER BY c.practical_requested_at, c.cert_id`,
    [query.facility ?? null, query.equipment_id ?? null],
  );
  return rows;
}

/**
 * Signs off or rejects a pending request (super user / admin). The update is conditional on the
 * request still being pending, so two reviewers acting at once cannot both succeed (ALREADY_ACTIONED).
 */
export async function decide(pool: pg.Pool, actor: Actor, certId: string, body: DecisionBody): Promise<MyCertificationRecord> {
  if (body.decision === 'rejected' && body.reason === '') {
    throw new DomainError('REASON_REQUIRED', 'Explain why the assessment was not approved; the researcher sees this');
  }
  await withTransaction(pool, async (tx) => {
    const { rows } = await tx.query<{ user_id: string; equipment_id: string; code: string; name: LocalizedText; validity: number | null }>(
      `SELECT c.user_id, c.equipment_id, e.code, e.name, e.certification_validity_months AS validity
       FROM user_certifications c JOIN equipment e ON e.equipment_id = c.equipment_id WHERE c.cert_id = $1`,
      [certId],
    );
    const cert = rows[0];
    if (!cert) throw notFound('certification');
    if (cert.user_id === actor.userId) throw new DomainError('FORBIDDEN', 'You cannot assess your own certification');

    const updated = body.decision === 'signed_off'
      ? await tx.query<{ expires_at: Date | null }>(
        `UPDATE user_certifications SET practical_status = 'signed_off', practical_signed_off_at = now(), evaluated_by = $2,
           practical_rejection_reason = NULL, practical_rejected_at = NULL,
           expires_at = CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(months => $3::int) END
         WHERE cert_id = $1 AND practical_status = 'pending' RETURNING expires_at`,
        [certId, actor.userId, cert.validity])
      : await tx.query<{ expires_at: Date | null }>(
        `UPDATE user_certifications SET practical_status = 'rejected', practical_rejected_at = now(), evaluated_by = $2,
           practical_rejection_reason = $3
         WHERE cert_id = $1 AND practical_status = 'pending' RETURNING expires_at`,
        [certId, actor.userId, body.reason]);
    if (updated.rowCount === 0) throw new DomainError('ALREADY_ACTIONED', 'This request has already been decided');

    await recordAudit(tx, {
      actorUserId: actor.userId, action: `certification.${body.decision}`, entityType: 'certification', entityId: certId,
      before: { practical_status: 'pending' },
      after: { practical_status: body.decision, user_id: cert.user_id, equipment_id: cert.equipment_id, reason: body.reason ?? null },
    });
    const equipment = { equipment_id: cert.equipment_id, equipment_code: cert.code, equipment_name: cert.name.en };
    if (body.decision === 'signed_off') {
      await notify(tx, cert.user_id, 'certification_signed_off', { ...equipment, expires_at: updated.rows[0]!.expires_at?.toISOString() ?? null });
    } else {
      await notify(tx, cert.user_id, 'certification_rejected', { ...equipment, reason: body.reason });
    }
  });
  return certById(pool, certId);
}

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiCalls, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { CertificationQueuePage } from './CertificationQueuePage.tsx';
import { TrainingDetailPage } from './TrainingDetailPage.tsx';
import { TrainingModuleEditor } from './TrainingModuleEditor.tsx';
import { TrainingPage } from './TrainingPage.tsx';

const eid = '66666666-6666-4666-8666-666666666666';
const mid = '77777777-7777-4777-8777-777777777777';
const envelope = (code: string, message: string) => ({ error: { code, message }, request_id: 'r' });
const cert = (access: string, extra: object = {}) => ({
  access, theoretical_passed: access !== 'training_required', theoretical_score: access === 'training_required' ? null : 100,
  practical_status: { training_required: 'not_requested', assessment_required: 'not_requested', assessment_pending: 'pending', reassessment_needed: 'rejected', certified: 'signed_off', expired: 'signed_off' }[access],
  practical_rejection_reason: null, expires_at: null, ...extra,
});
const equipment = (access: string, extra: object = {}) => ({
  equipment_id: eid, code: 'EBL_CRESTEC', facility: 'NFL', name: 'EBL CRESTEC CABL-9510C', description: 'EBL', status: 'operational',
  base_rate_hourly: '80.20', buffer_time_minutes: 30, certification_validity_months: 24, has_interlock: false,
  availability_windows: [], support_tariffs: [], my_certification: cert(access, extra),
});
const trainingModule = {
  module_id: mid, equipment_id: eid, equipment_code: 'EBL_CRESTEC', equipment_name: 'EBL CRESTEC CABL-9510C',
  sop_document_url: 'https://docs.icfo.test/sop.pdf', passing_score: 80,
  questions: [
    { question_id: 1, prompt: 'What must you verify first?', options: ['Nothing', 'Status and PPE'] },
    { question_id: 2, prompt: 'Who may override the interlock?', options: ['Staff only', 'Anyone'] },
  ],
};
const routes = [{ path: '/training/:equipmentId', element: <TrainingDetailPage /> }];
const me = { 'GET /auth/me': [200, sessionUser()] } as const;

describe('TrainingDetailPage', () => {
  it('walks from SOP to quiz and records a pass', async () => {
    let access = 'training_required';
    const fetchMock = stubApi({
      ...me,
      [`GET /equipment/${eid}`]: () => [200, equipment(access)],
      [`GET /training/${eid}`]: [200, trainingModule],
      'POST /training/submit-quiz': () => {
        access = 'assessment_required';
        return [200, { score: 100, passed: true, passing_score: 80, correct: 2, total: 2, already_passed: false }];
      },
    });
    renderRoutes(routes, `/training/${eid}`);
    expect((await screen.findByRole('link', { name: /Open the SOP/ })).getAttribute('href')).toBe('https://docs.icfo.test/sop.pdf');
    expect(screen.getByRole('button', { name: 'Start the quiz' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /I have read and understood the SOP/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start the quiz' }));

    await userEvent.click(screen.getByRole('radio', { name: 'Status and PPE' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Staff only' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(await screen.findByText('Quiz passed')).toBeTruthy();
    expect(apiCalls(fetchMock).find((c) => c.method === 'POST')?.body).toEqual({
      module_id: mid, answers: [{ question_id: 1, selected_option: 1 }, { question_id: 2, selected_option: 0 }],
    });
    expect(await screen.findByRole('button', { name: 'Request practical assessment' })).toBeTruthy();
  });

  it('requires every question to be answered and offers a retry after failing', async () => {
    stubApi({
      ...me, [`GET /equipment/${eid}`]: [200, equipment('training_required')], [`GET /training/${eid}`]: [200, trainingModule],
      'POST /training/submit-quiz': [200, { score: 50, passed: false, passing_score: 80, correct: 1, total: 2, already_passed: false }],
    });
    renderRoutes(routes, `/training/${eid}`);
    await userEvent.click(await screen.findByRole('checkbox', { name: /I have read/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start the quiz' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Nothing' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(screen.getByText('Answer every question before submitting (1 of 2 answered).')).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'Anyone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(await screen.findByText(/You scored 50%/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('radio', { name: 'Nothing' })).toHaveProperty('checked', false);
  });

  it('requests the practical assessment, showing the reviewer note after a rejection', async () => {
    let access = 'reassessment_needed';
    stubApi({
      ...me,
      [`GET /equipment/${eid}`]: () => [200, equipment(access, access === 'reassessment_needed' ? { practical_rejection_reason: 'Practise sample loading' } : {})],
      [`GET /training/${eid}`]: [200, trainingModule],
      [`POST /certifications/${eid}/request-practical`]: () => { access = 'assessment_pending'; return [201, {}]; },
    });
    renderRoutes(routes, `/training/${eid}`);
    expect(await screen.findByText(/Practise sample loading/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Request practical assessment' }));
    expect(await screen.findByText(/waiting for a super user/)).toBeTruthy();
  });

  it('explains when an instrument has no training yet', async () => {
    stubApi({ ...me, [`GET /equipment/${eid}`]: [200, equipment('training_required')], [`GET /training/${eid}`]: [404, envelope('NOT_FOUND', 'This training module does not exist')] });
    renderRoutes(routes, `/training/${eid}`);
    expect(await screen.findByText("Training for this instrument isn't available yet")).toBeTruthy();
  });
});

describe('TrainingPage', () => {
  it('summarises my certifications and links each to its training', async () => {
    stubApi({ ...me, 'GET /certifications/me': [200, [
      { cert_id: 'c1', equipment_id: eid, equipment_code: 'EBL_CRESTEC', equipment_name: 'EBL CRESTEC', facility: 'NFL', ...cert('assessment_pending'), theoretical_passed_at: null, practical_requested_at: null, practical_signed_off_at: null },
      { cert_id: 'c2', equipment_id: 'e2', equipment_code: 'RIE', equipment_name: 'RIE Oxford', facility: 'NFL', ...cert('certified'), theoretical_passed_at: null, practical_requested_at: null, practical_signed_off_at: null },
    ]] });
    renderRoutes([{ path: '/training', element: <TrainingPage /> }], '/training');
    const kpis = await screen.findByRole('list', { name: 'Certification summary' });
    expect(within(kpis).getByText('1 certified')).toBeTruthy();
    expect(within(kpis).getByText('1 in progress')).toBeTruthy();
    expect(screen.getByRole('link', { name: /EBL CRESTEC/ }).getAttribute('href')).toBe(`/training/${eid}`);
  });

  it('points newcomers to the equipment list', async () => {
    stubApi({ ...me, 'GET /certifications/me': [200, []] });
    renderRoutes([{ path: '/training', element: <TrainingPage /> }], '/training');
    expect(await screen.findByText("You haven't started training on any instrument yet.")).toBeTruthy();
  });
});

describe('CertificationQueuePage', () => {
  const pending = [{
    cert_id: 'c1', theoretical_score: 94, practical_requested_at: '2026-09-27T10:00:00Z',
    user: { user_id: 'u1', full_name: 'Anna Kowalski', email: 'anna@icfo.test', user_type: 'internal' },
    equipment: { equipment_id: eid, code: 'EBL_CRESTEC', name: 'EBL CRESTEC', facility: 'NFL' },
  }];
  const staff = { 'GET /auth/me': [200, sessionUser({ role: 'super_user' })] } as const;

  it('approves a request', async () => {
    let queue = pending;
    const fetchMock = stubApi({
      ...staff, 'GET /certifications/pending': () => [200, queue],
      'POST /certifications/c1/decision': () => { queue = []; return [200, {}]; },
    });
    renderRoutes([{ path: '/q', element: <CertificationQueuePage /> }], '/q');
    await userEvent.click(await screen.findByRole('button', { name: 'Review Anna Kowalski for EBL_CRESTEC' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('94%')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve certification' }));
    expect(await screen.findByText('No practical assessments are waiting.')).toBeTruthy();
    expect(apiCalls(fetchMock).find((c) => c.method === 'POST')?.body).toEqual({ decision: 'signed_off' });
  });

  it('requires feedback to reject, and explains a request someone else already decided', async () => {
    stubApi({ ...staff, 'GET /certifications/pending': [200, pending],
      'POST /certifications/c1/decision': [409, envelope('ALREADY_ACTIONED', 'This request has already been decided')] });
    renderRoutes([{ path: '/q', element: <CertificationQueuePage /> }], '/q');
    await userEvent.click(await screen.findByRole('button', { name: /Review Anna/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Request reassessment' }));
    expect(within(dialog).getByText('Tell the researcher what to improve — they will see this.')).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText('Feedback for the researcher'), 'Practise sample loading');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Request reassessment' }));
    expect(await within(dialog).findByText(/Another super user has already decided/)).toBeTruthy();
  });
});

describe('TrainingModuleEditor', () => {
  it('validates the quiz and saves it with the correct answers', async () => {
    const fetchMock = stubApi({ [`PUT /admin/equipment/${eid}/training-module`]: [200, {}] });
    renderRoutes([{ path: '/', element: <TrainingModuleEditor equipmentId={eid} initial={null} /> }], '/');
    await userEvent.click(screen.getByRole('button', { name: 'Save training' }));
    expect(screen.getByText('Enter the full address of the SOP, starting with https://')).toBeTruthy();

    await userEvent.type(screen.getByLabelText('SOP document link'), 'https://docs.icfo.test/sop.pdf');
    await userEvent.type(screen.getByLabelText('Question 1'), 'What must you verify first?');
    await userEvent.type(screen.getByLabelText('Question 1, option 1'), 'Nothing');
    await userEvent.type(screen.getByLabelText('Question 1, option 2'), 'Status and PPE');
    await userEvent.click(screen.getByRole('radio', { name: 'Question 1, option 2 is correct' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save training' }));
    expect(await screen.findByText('Training saved.')).toBeTruthy();
    expect(apiCalls(fetchMock)[0]?.body).toEqual({
      sop_document_url: 'https://docs.icfo.test/sop.pdf', passing_score: 80,
      questions: [{ prompt: 'What must you verify first?', options: ['Nothing', 'Status and PPE'], correct_option: 1 }],
    });
  });
});

describe('admin Training tab', () => {
  it('confirms the first save of a module that did not exist yet', async () => {
    const { TrainingTab } = await import('../admin-equipment/AdminEquipmentDetailPage.tsx');
    let saved: object | null = null;
    stubApi({
      [`GET /admin/equipment/${eid}/training-module`]: () => saved ? [200, saved] : [404, envelope('NOT_FOUND', 'This training module does not exist')],
      [`PUT /admin/equipment/${eid}/training-module`]: (body) => { saved = { module_id: mid, equipment_id: eid, ...(body as object) }; return [200, saved]; },
    });
    renderRoutes([{ path: '/', element: <TrainingTab equipmentId={eid} /> }], '/');
    await userEvent.type(await screen.findByLabelText('SOP document link'), 'https://docs.icfo.test/sop.pdf');
    await userEvent.type(screen.getByLabelText('Question 1'), 'Q?');
    await userEvent.type(screen.getByLabelText('Question 1, option 1'), 'A');
    await userEvent.type(screen.getByLabelText('Question 1, option 2'), 'B');
    await userEvent.click(screen.getByRole('button', { name: 'Save training' }));
    expect(await screen.findByText('Training saved.')).toBeTruthy();
  });
});

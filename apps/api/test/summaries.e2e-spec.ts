/**
 * GET /admissions/:admissionId/summary.
 *
 * The model is the fake; everything else is real — the database, the cache,
 * the ledger, the budget gate, the verifier. What these tests are about is
 * not whether a language model writes good prose. It is whether the machinery
 * around it does the right thing when the model is slow, wrong, expensive or
 * absent, which is the part that has to work before the prose matters at all.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { LLM_CLIENT } from '../src/summaries/llm.client.js';
import { LlmConfig } from '../src/summaries/llm.config.js';
import { FakeLlmClient, providerDown } from '../src/summaries/llm.fake.js';
import { PROMPT_VERSION } from '../src/summaries/prompt.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { seedAdmittedPatient, seedObservation, seedPatient, seedAdmission } from './helpers/seed.js';

const BUDGET_MICRO_USD = 5_000_000;

/**
 * Mutable on purpose: a test that needs an unconfigured application changes
 * one field instead of booting a second one.
 */
const config = {
  apiKey: 'test-key',
  model: 'fake-model-1',
  monthlyBudgetMicroUsd: BUDGET_MICRO_USD,
  pricing: { inputMicroUsdPerMillion: 1_000_000, outputMicroUsdPerMillion: 5_000_000 },
  maxOutputTokens: 300,
  observationRounds: 6,
  get configured(): boolean {
    return this.apiKey.length > 0;
  },
};

const llm = new FakeLlmClient();

describe('GET /admissions/:admissionId/summary', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp([
      { token: LLM_CLIENT, useValue: llm },
      { token: LlmConfig, useValue: config },
    ]);
  });

  beforeEach(async () => {
    await testApp.reset();
    llm.calls.length = 0;
    config.apiKey = 'test-key';
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('answers 404 for an admission that does not exist', async () => {
    await request(testApp.server).get('/admissions/ADM-nope/summary').expect(404);
  });

  it('writes a summary on the first request and marks it current', async () => {
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);

    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    expect(body.state).toBe('current');
    expect(body.reason).toBeNull();
    expect(body.text).toContain('stable');
    expect(body.promptVersion).toBe(PROMPT_VERSION);
    expect(body.roundsUsed).toBe(1);
    expect(llm.calls).toHaveLength(1);
  });

  it('always says the text is derived, never a clinical record', async () => {
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);

    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    expect(body.disclaimer).toContain('Derived text, not a clinical record');
  });

  it('serves the second request from the cache, without calling the model', async () => {
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);

    await request(testApp.server).get(`/admissions/${admissionId}/summary`).expect(200);
    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    expect(body.state).toBe('current');
    // The whole point of the cache: pressing refresh costs nothing.
    expect(llm.calls).toHaveLength(1);
  });

  it('regenerates when a new observation arrives, and not before', async () => {
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);

    await request(testApp.server).get(`/admissions/${admissionId}/summary`).expect(200);
    await seedObservation(testApp.prisma, {
      admissionId,
      recordedAt: new Date('2026-09-01T16:00:00.000Z'),
    });

    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    expect(body.state).toBe('current');
    expect(body.roundsUsed).toBe(2);
    expect(llm.calls).toHaveLength(2);
  });

  it('reports an admission with no observations instead of inventing one', async () => {
    const patient = await seedPatient(testApp.prisma);
    const admission = await seedAdmission(testApp.prisma, { mrn: patient.mrn });

    const { body } = await request(testApp.server)
      .get(`/admissions/${admission.admissionId}/summary`)
      .expect(200);

    expect(body.state).toBe('unavailable');
    expect(body.text).toBeNull();
    expect(body.reason).toContain('no observations');
    expect(llm.calls).toHaveLength(0);
  });

  it('refuses a summary that contains a figure nobody measured', async () => {
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);
    llm.respondWith('Saturation has fallen to 88% overnight.');

    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    expect(body.state).toBe('unavailable');
    expect(body.text).toBeNull();
    expect(body.reason).toContain('verification');

    // Billed and thrown away — both halves recorded, so the rejection rate is
    // a query rather than a feeling.
    const call = await testApp.prisma.llmCall.findFirst({ where: { subjectId: admissionId } });
    expect(call?.status).toBe('rejected');
    expect(call?.error).toContain('88');
    expect(call?.costMicroUsd).toBeGreaterThan(0);
  });

  it('keeps serving the last good summary when a later one is refused', async () => {
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);
    await request(testApp.server).get(`/admissions/${admissionId}/summary`).expect(200);

    await seedObservation(testApp.prisma, {
      admissionId,
      recordedAt: new Date('2026-09-01T16:00:00.000Z'),
    });
    llm.respondWith('Pulse is now 199.');

    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    expect(body.state).toBe('stale');
    expect(body.text).toContain('stable');
    expect(body.reason).toContain('verification');
  });

  it('records what a successful call cost', async () => {
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);

    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    const call = await testApp.prisma.llmCall.findFirstOrThrow({
      where: { subjectId: admissionId },
    });

    expect(call.status).toBe('succeeded');
    expect(call.purpose).toBe('summary');
    expect(call.inputTokens).toBeGreaterThan(0);
    expect(call.outputTokens).toBeGreaterThan(0);
    expect(call.costMicroUsd).toBeGreaterThan(0);
    expect(body.budget.spentUsd).toBeGreaterThan(0);
    expect(body.budget.limitUsd).toBe(5);
  });

  it('stops calling the model once the month is spent', async () => {
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);
    await request(testApp.server).get(`/admissions/${admissionId}/summary`).expect(200);

    await testApp.prisma.llmCall.create({
      data: {
        purpose: 'summary',
        subjectId: null,
        model: 'fake-model-1',
        promptVersion: PROMPT_VERSION,
        inputTokens: 0,
        outputTokens: 0,
        costMicroUsd: BUDGET_MICRO_USD,
        status: 'succeeded',
        error: null,
        durationMs: 1,
      },
    });

    await seedObservation(testApp.prisma, {
      admissionId,
      recordedAt: new Date('2026-09-01T16:00:00.000Z'),
    });

    const callsBefore = llm.calls.length;
    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    expect(llm.calls).toHaveLength(callsBefore);
    expect(body.state).toBe('stale');
    expect(body.reason).toContain('budget');
    expect(body.budget.remainingUsd).toBe(0);
    // Degraded, not broken: the paragraph is still there, labelled as old and
    // carrying the round it actually covers.
    expect(body.text).toContain('stable');
    expect(body.throughRecordedAt).toBe('2026-09-01T12:00:00.000Z');
  });

  it('charges the worst case to the ledger when a call never comes back', async () => {
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);
    llm.failWith(providerDown());

    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    expect(body.state).toBe('unavailable');
    expect(body.reason).toContain('could not be reached');

    const call = await testApp.prisma.llmCall.findFirstOrThrow({
      where: { subjectId: admissionId },
    });

    expect(call.status).toBe('failed');
    expect(call.error).toContain('529');
    // A request that was billed and then failed still spent money.
    expect(call.costMicroUsd).toBeGreaterThan(0);
  });

  it('answers honestly when no model is configured', async () => {
    config.apiKey = '';
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);

    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    expect(body.state).toBe('unavailable');
    expect(body.reason).toContain('No model is configured');
    expect(llm.calls).toHaveLength(0);
  });

  it('regenerates when the prompt changes, even with no new observation', async () => {
    const { admissionId } = await seedAdmittedPatient(testApp.prisma);
    await request(testApp.server).get(`/admissions/${admissionId}/summary`).expect(200);

    // What a prompt edit looks like from the database's point of view: the
    // stored summary was written by a version that is no longer in force.
    await testApp.prisma.summary.update({
      where: { admissionId },
      data: { promptVersion: 'handover-0' },
    });

    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/summary`)
      .expect(200);

    expect(body.promptVersion).toBe(PROMPT_VERSION);
    expect(llm.calls).toHaveLength(2);
  });
});

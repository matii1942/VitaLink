/**
 * One admission: who the patient is, what the shift should know, how the
 * score has moved, and every round behind it.
 *
 * The order on screen is the order a handover is given in — the summary
 * first, the trend second, the numbers last — and each layer is checkable
 * against the one below it. That is deliberate. The paragraph at the top was
 * written by a language model, and the only reason it is safe to put at the
 * top is that the evidence for it is on the same page.
 */
import { Link, useParams } from 'react-router-dom';

import { useResource, type Resource } from '../api';
import { News2Trend } from '../components/News2Trend';
import { riskLabel, sexInitial, timeAgo } from '../format';
import type { AdmissionWithPatient, ObservationView, Page, SummaryView } from '../types';

/** Enough rounds for a day or two of trend without asking for the whole stay. */
const ROUNDS = 40;

export function PatientDetail() {
  const { admissionId = '' } = useParams();
  const id = encodeURIComponent(admissionId);

  const admission = useResource<AdmissionWithPatient>(`/admissions/${id}`);
  const observations = useResource<Page<ObservationView>>(
    `/admissions/${id}/observations?order=desc&pageSize=${ROUNDS}`,
  );
  const summary = useResource<SummaryView>(`/admissions/${id}/summary`);

  if (admission.loading) {
    return <p className="state">Loading…</p>;
  }

  if (admission.error !== null || admission.data === null) {
    return (
      <p className="state" data-kind="error">
        Could not load admission {admissionId}: {admission.error?.message ?? 'no data'}
      </p>
    );
  }

  const row = admission.data;
  const rounds = observations.data?.data ?? [];

  return (
    <>
      <Link className="back" to={`/wards/${encodeURIComponent(row.ward)}`}>
        ← {row.ward}
      </Link>

      <div className="board-head">
        <h2>
          {row.patient.familyName}, {row.patient.givenName}
        </h2>
        <span className="meta">
          {row.patient.age} {sexInitial(row.patient.sex)} · {row.patient.mrn} · {row.ward}
        </span>
      </div>

      <dl className="facts">
        <Fact label="Diagnosis" value={row.diagnosis ?? 'not recorded'} />
        <Fact label="Admitted" value={`${timeAgo(row.admittedAt)} · ${row.admissionType}`} />
        <Fact label="From" value={row.sourceUnit ?? 'home'} />
        <div className="fact">
          <dt>Status</dt>
          <dd>
            {row.awaitingCriticalCare && row.criticalCareRequest !== null ? (
              <span className="flag" data-kind="critical-care">
                awaiting {row.criticalCareRequest.unit} ·{' '}
                {timeAgo(row.criticalCareRequest.requestedAt)}
              </span>
            ) : row.active ? (
              'in a bed'
            ) : (
              `discharged to ${row.dischargeDestination ?? 'unknown'}`
            )}
          </dd>
        </div>
        <Fact label="Rounds recorded" value={String(row.observationCount)} />
      </dl>

      <Summary resource={summary} />

      <section className="card section">
        <h3>Trend</h3>
        {observations.loading ? (
          <p className="subtle">Loading observations…</p>
        ) : (
          // The chart wants oldest first; the table below wants newest first.
          // toReversed leaves the original array alone, which matters because
          // React re-renders from the same data and an in-place reverse would
          // flip it again on every pass.
          <News2Trend observations={rounds.toReversed()} />
        )}
      </section>

      <section className="section">
        <h3>Observations</h3>
        <Rounds rounds={rounds} loading={observations.loading} />
      </section>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * The clinical summary.
 *
 * Every branch here says where the text came from and how old it is. A
 * paragraph that a machine wrote, shown without that, is indistinguishable
 * from a paragraph a colleague wrote — and the whole design of Sprint 5
 * rests on it never being mistaken for one (ADR 0012).
 */
function Summary({ resource }: { resource: Resource<SummaryView> }) {
  const { data, loading, error } = resource;

  if (loading) {
    return (
      <section className="card section">
        <h3>Handover summary</h3>
        <p className="subtle">Writing…</p>
      </section>
    );
  }

  if (error !== null || data === null) {
    return (
      <section className="card section">
        <h3>Handover summary</h3>
        <p className="subtle">Unavailable: {error?.message ?? 'no answer'}</p>
      </section>
    );
  }

  return (
    <section className="card section summary" data-state={data.state}>
      <h3>
        Handover summary
        <span className="flag" data-kind={data.state}>
          {data.state}
        </span>
      </h3>

      {data.text === null ? (
        <p className="subtle">{data.reason ?? 'Nothing has been written for this admission.'}</p>
      ) : (
        <>
          <p className="summary-text">{data.text}</p>
          {data.reason !== null && <p className="subtle">Not refreshed: {data.reason}</p>}
          <p className="subtle">
            Covers observations up to{' '}
            {data.throughRecordedAt === null ? 'an unknown round' : timeAgo(data.throughRecordedAt)}
            {data.roundsUsed !== null && ` · ${data.roundsUsed} rounds read`}
            {data.model !== null && ` · ${data.model}`}
          </p>
        </>
      )}

      <p className="disclaimer">{data.disclaimer}</p>
    </section>
  );
}

function Rounds({ rounds, loading }: { rounds: ObservationView[]; loading: boolean }) {
  if (loading) {
    return <p className="subtle">Loading observations…</p>;
  }

  if (rounds.length === 0) {
    return <p className="subtle">No vital signs have been recorded for this admission.</p>;
  }

  return (
    <table className="board">
      <caption>Most recent first. A dash is a measurement that was not taken.</caption>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">NEWS2</th>
          <th scope="col">Resp</th>
          <th scope="col">SpO2</th>
          <th scope="col">Support</th>
          <th scope="col">Systolic</th>
          <th scope="col">Pulse</th>
          <th scope="col">Glasgow</th>
          <th scope="col">Temp</th>
        </tr>
      </thead>
      <tbody>
        {rounds.map((round) => (
          <tr key={round.observationId}>
            <td className="subtle nowrap">{timeAgo(round.recordedAt)}</td>
            <td>
              <div className="score">
                <span className="aggregate">{round.score?.aggregate ?? '—'}</span>
                <span className="band">
                  <span className="dot" data-risk={round.score?.risk ?? 'none'} aria-hidden="true" />
                  {riskLabel(round.score?.risk ?? null, round.score?.status)}
                </span>
              </div>
            </td>
            <td className="num">{round.respirationRate ?? '—'}</td>
            <td className="num">{round.oxygenSaturation ?? '—'}</td>
            <td className="subtle">{round.respiratorySupport}</td>
            <td className="num">{round.systolicBP ?? '—'}</td>
            <td className="num">{round.pulse ?? '—'}</td>
            <td className="num">{round.glasgow.total}</td>
            <td className="num">{round.temperature ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

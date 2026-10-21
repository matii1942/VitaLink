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
import { useParams } from 'react-router-dom';

import { useResource, type Resource } from '../api';
import { News2Trend } from '../components/News2Trend';
import { riskLabel, sexInitial, timeAgo } from '../format';
import { LangLink, useText } from '../i18n/language';
import type { AdmissionWithPatient, ObservationView, Page, SummaryView } from '../types';

/** Enough rounds for a day or two of trend without asking for the whole stay. */
const ROUNDS = 40;

export function PatientDetail() {
  const text = useText();
  const { admissionId = '' } = useParams();
  const id = encodeURIComponent(admissionId);

  const admission = useResource<AdmissionWithPatient>(`/admissions/${id}`);
  const observations = useResource<Page<ObservationView>>(
    `/admissions/${id}/observations?order=desc&pageSize=${ROUNDS}`,
  );
  const summary = useResource<SummaryView>(`/admissions/${id}/summary`);

  if (admission.loading) {
    return <p className="state">{text.wards.loading}</p>;
  }

  if (admission.error !== null || admission.data === null) {
    return (
      <p className="state" data-kind="error">
        {text.patient.couldNotLoad(admissionId, admission.error?.message ?? 'no data')}
      </p>
    );
  }

  const row = admission.data;
  const rounds = observations.data?.data ?? [];

  return (
    <>
      <LangLink className="back" to={`/wards/${encodeURIComponent(row.ward)}`}>
        ← {row.ward}
      </LangLink>

      <div className="board-head">
        <h2>
          {row.patient.familyName}, {row.patient.givenName}
        </h2>
        <span className="meta">
          {row.patient.age} {sexInitial(row.patient.sex, text.sex)} · {row.patient.mrn} ·{' '}
          {row.ward}
        </span>
      </div>

      <dl className="facts">
        {/* Diagnosis, admission type and source unit are data, untranslated. */}
        <Fact label={text.patient.facts.diagnosis} value={row.diagnosis ?? text.common.notRecorded} />
        <Fact
          label={text.patient.facts.admitted}
          value={`${timeAgo(row.admittedAt, text.time)} · ${row.admissionType}`}
        />
        <Fact label={text.patient.facts.from} value={row.sourceUnit ?? text.common.home} />
        <div className="fact">
          <dt>{text.patient.facts.status}</dt>
          <dd>
            {row.awaitingCriticalCare && row.criticalCareRequest !== null ? (
              <span className="flag" data-kind="critical-care">
                {text.patient.awaiting(
                  row.criticalCareRequest.unit,
                  timeAgo(row.criticalCareRequest.requestedAt, text.time),
                )}
              </span>
            ) : row.active ? (
              text.patient.inABed
            ) : (
              text.patient.dischargedTo(row.dischargeDestination ?? text.common.unknown)
            )}
          </dd>
        </div>
        <Fact label={text.patient.facts.roundsRecorded} value={String(row.observationCount)} />
      </dl>

      <Summary resource={summary} />

      <section className="card section">
        <h3>{text.patient.trend}</h3>
        {observations.loading ? (
          <p className="subtle">{text.patient.loadingObservations}</p>
        ) : (
          // The chart wants oldest first; the table below wants newest first.
          // toReversed leaves the original array alone, which matters because
          // React re-renders from the same data and an in-place reverse would
          // flip it again on every pass.
          <News2Trend observations={rounds.toReversed()} />
        )}
      </section>

      <section className="section">
        <h3>{text.patient.observations}</h3>
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
  const text = useText();
  const { data, loading, error } = resource;

  if (loading) {
    return (
      <section className="card section">
        <h3>{text.patient.summary.title}</h3>
        <p className="subtle">{text.patient.summary.writing}</p>
      </section>
    );
  }

  if (error !== null || data === null) {
    return (
      <section className="card section">
        <h3>{text.patient.summary.title}</h3>
        <p className="subtle">
          {text.patient.summary.unavailable(error?.message ?? 'no answer')}
        </p>
      </section>
    );
  }

  return (
    <section className="card section summary" data-state={data.state}>
      <h3>
        {text.patient.summary.title}
        <span className="flag" data-kind={data.state}>
          {data.state}
        </span>
      </h3>

      {data.text === null ? (
        <p className="subtle">{data.reason ?? text.patient.summary.nothingWritten}</p>
      ) : (
        <>
          {/*
            The handover note is written by a language model on the server,
            from an English prompt, so it arrives in English whatever language
            this page is in. Marking it says so honestly and keeps a Spanish
            screen reader from mangling it.

            This is the one piece of prose on the site that a translation
            cannot reach from here, and the fix is not a client-side one:
            translating it in the browser would mean a second model pass over
            clinical text, with a second chance to change what it says. The
            right fix is for the API to generate in the language asked for —
            an `Accept-Language` on /summary and a prompt per language, with
            the verifier run against each. Recorded in ADR 0017.
          */}
          <p className="summary-text" lang="en">
            {data.text}
          </p>
          {data.reason !== null && (
            <p className="subtle">{text.patient.summary.notRefreshed(data.reason)}</p>
          )}
          <p className="subtle">
            {text.patient.summary.covers(
              data.throughRecordedAt === null
                ? text.patient.summary.unknownRound
                : timeAgo(data.throughRecordedAt, text.time),
            )}
            {data.roundsUsed !== null && ` · ${text.patient.summary.roundsRead(data.roundsUsed)}`}
            {data.model !== null && ` · ${data.model}`}
          </p>
        </>
      )}

      {/*
        The API's own wording, for the same reason as the board's ordering
        rule: it states what the summary is and is not, and a client that
        paraphrased it could soften it. `lang` marks it as English so a
        Spanish screen reader does not try to pronounce it as Spanish.
      */}
      <p className="disclaimer" lang="en">
        {data.disclaimer}
      </p>
    </section>
  );
}

function Rounds({ rounds, loading }: { rounds: ObservationView[]; loading: boolean }) {
  const text = useText();

  if (loading) {
    return <p className="subtle">{text.patient.loadingObservations}</p>;
  }

  if (rounds.length === 0) {
    return <p className="subtle">{text.patient.noVitalSigns}</p>;
  }

  return (
    <table className="board">
      <caption>{text.patient.roundsCaption}</caption>
      <thead>
        <tr>
          <th scope="col">{text.patient.columns.when}</th>
          <th scope="col">{text.patient.columns.news2}</th>
          <th scope="col">{text.patient.columns.resp}</th>
          <th scope="col">{text.patient.columns.spo2}</th>
          <th scope="col">{text.patient.columns.support}</th>
          <th scope="col">{text.patient.columns.systolic}</th>
          <th scope="col">{text.patient.columns.pulse}</th>
          <th scope="col">{text.patient.columns.glasgow}</th>
          <th scope="col">{text.patient.columns.temp}</th>
        </tr>
      </thead>
      <tbody>
        {rounds.map((round) => (
          <tr key={round.observationId}>
            <td className="subtle nowrap">{timeAgo(round.recordedAt, text.time)}</td>
            <td>
              <div className="score">
                <span className="aggregate">{round.score?.aggregate ?? '—'}</span>
                <span className="band">
                  <span className="dot" data-risk={round.score?.risk ?? 'none'} aria-hidden="true" />
                  {riskLabel(round.score?.risk ?? null, round.score?.status, text.common)}
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

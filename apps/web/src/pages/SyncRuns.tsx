/**
 * The synchronisation, seen from outside.
 *
 * Every other screen in this application shows clinical data. This one shows
 * the machinery that brings it in, and it exists because that machinery runs
 * once an hour, unattended, 8,760 times a year, and until now the only way to
 * know whether it had worked was to open the database.
 *
 * Two things on this screen are the whole argument of the project, made
 * visible rather than claimed:
 *
 * The run history. Consecutive runs over unchanged data report the same
 * counts and the ward does not grow. That is idempotence — the upserts are
 * keyed on the hospital's own identifiers, so running twice changes nothing —
 * and it is the property that makes an hourly job safe to leave alone.
 *
 * The rejected records. A normaliser that silently dropped what it could not
 * read would leave a clinician looking at an incomplete chart with no way to
 * know it. Every refusal is counted, and the reason is kept and shown here.
 * A run that rejects nothing says so; a run that rejects something says what.
 */
import { useResource } from '../api';
import { timeAgo } from '../format';
import type { SyncRunView } from '../types';

export function SyncRuns() {
  const { data, loading, error } = useResource<SyncRunView[]>('/sync/runs');

  if (loading) {
    return <p className="state">Loading the synchronisation history…</p>;
  }

  if (error !== null) {
    return (
      <p className="state" data-kind="error">
        Could not load the runs: {error.message}
      </p>
    );
  }

  if (data === null || data.length === 0) {
    return (
      <p className="state">
        No synchronisation has run yet. The hourly schedule has not fired and nobody has
        started one by hand.
      </p>
    );
  }

  const [latest, ...earlier] = data as [SyncRunView, ...SyncRunView[]];

  return (
    <>
      <div className="board-head">
        <h2>Synchronisation</h2>
        <span className="meta">
          every hour, on its own · {runs(data.length)} kept
        </span>
      </div>

      <p className="lede">
        VitaLink pulls every admission and every set of vital signs from the hospital&rsquo;s
        system, normalises them, and scores each round. It runs on a schedule and nobody
        watches it. This is what it has been doing.
      </p>

      <LatestRun run={latest} />

      <Idempotence runs={data} />

      {earlier.length > 0 && (
        <section className="section">
          <h3>Earlier runs</h3>
          <table className="board">
            <caption>Newest first. The last {runs(data.length)} the database keeps.</caption>
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">Status</th>
                <th scope="col">Took</th>
                <th scope="col">Patients</th>
                <th scope="col">Admissions</th>
                <th scope="col">Observations</th>
                <th scope="col">Rejected</th>
                <th scope="col">Scored</th>
              </tr>
            </thead>
            <tbody>
              {data.map((run) => (
                <tr key={run.id}>
                  <td>{timeAgo(run.startedAt)}</td>
                  <td>
                    <StatusFlag status={run.status} />
                  </td>
                  <td className="num">{duration(run.durationMs)}</td>
                  <td className="num">{run.patientsSynced}</td>
                  <td className="num">{run.admissionsSynced}</td>
                  <td className="num">{run.observationsSynced}</td>
                  <td className="num" data-kind={run.observationsRejected > 0 ? 'warn' : undefined}>
                    {run.observationsRejected}
                  </td>
                  <td className="num">{run.scoresComputed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Rejected runs={data} />
    </>
  );
}

/** The run that matters most: the one that decides whether the board is current. */
function LatestRun({ run }: { run: SyncRunView }) {
  return (
    <section className="card section run-latest" data-status={run.status}>
      <h3>
        Last run <StatusFlag status={run.status} />
      </h3>

      <p className="subtle">
        Started {timeAgo(run.startedAt)}
        {run.durationMs !== null && ` · took ${duration(run.durationMs)}`}
      </p>

      <dl className="tiles">
        <Tile label="Patients" value={run.patientsSynced} />
        <Tile label="Admissions" value={run.admissionsSynced} />
        <Tile label="Observations" value={run.observationsSynced} />
        <Tile label="Scored" value={run.scoresComputed} />
        <Tile
          label="Rejected"
          value={run.observationsRejected}
          kind={run.observationsRejected > 0 ? 'warn' : 'quiet'}
        />
      </dl>

      <p className="disclaimer">
        {run.observationsRejected === 0
          ? 'Every record the hospital sent was readable. Nothing was dropped.'
          : 'The records below could not be read. They were counted and kept out, not discarded quietly.'}
      </p>
    </section>
  );
}

/**
 * The claim this project makes about its integration, checked against its own
 * history rather than asserted.
 *
 * Two runs over unchanged data must report the same counts. If they do, the
 * upserts are doing their job; if they ever do not, this is where it shows.
 */
function Idempotence({ runs: history }: { runs: SyncRunView[] }) {
  const finished = history.filter((run) => run.finishedAt !== null);

  if (finished.length < 2) {
    return null;
  }

  const [newest, previous] = finished as [SyncRunView, SyncRunView, ...SyncRunView[]];
  const same =
    newest.patientsSynced === previous.patientsSynced &&
    newest.admissionsSynced === previous.admissionsSynced &&
    newest.observationsSynced === previous.observationsSynced;

  return (
    <section className="card section" data-testid="idempotence">
      <h3>Running it twice</h3>
      <p className="subtle">
        {same ? (
          <>
            The last two runs each took in {newest.observationsSynced} observations over{' '}
            {newest.admissionsSynced} admissions, and the ward did not grow. The
            synchronisation upserts on the hospital&rsquo;s own identifiers, so running it
            again changes nothing — which is what makes an hourly job safe to leave
            unattended.
          </>
        ) : (
          <>
            The last two runs took in different amounts — {previous.observationsSynced} then{' '}
            {newest.observationsSynced} observations. That is expected when new rounds were
            recorded in between; it would only be a defect if the data had not changed.
          </>
        )}
      </p>
    </section>
  );
}

/** What was refused, and why. Empty is an answer, so it is said out loud. */
function Rejected({ runs: history }: { runs: SyncRunView[] }) {
  const issues = history.flatMap((run) =>
    run.issues.map((issue) => ({ ...issue, runId: run.id, startedAt: run.startedAt })),
  );

  if (issues.length === 0) {
    return null;
  }

  return (
    <section className="section">
      <h3>Records that could not be read</h3>
      <table className="board">
        <caption>
          Across the runs shown. Each one was counted and left out of the record rather than
          guessed at.
        </caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Record</th>
            <th scope="col">Field</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue, index) => (
            // The record identifier repeats across runs — the same bad row is
            // refused every hour — so the key pairs it with the run.
            <tr key={`${issue.runId}-${issue.record}-${index}`}>
              <td>{timeAgo(issue.startedAt)}</td>
              <td>{issue.record}</td>
              <td>{issue.field ?? '—'}</td>
              <td>{issue.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Tile({
  label,
  value,
  kind,
}: {
  label: string;
  value: number;
  kind?: 'warn' | 'quiet';
}) {
  return (
    // Number first, label under it — the same order as the headline tiles on
    // the first screen. A definition list allows either, and two screens
    // disagreeing about it reads as two different applications.
    <div className="tile" data-kind={kind}>
      <dd>{value}</dd>
      <dt>{label}</dt>
    </div>
  );
}

/**
 * The status as a word, never as a colour alone — the same rule the ward
 * board follows, for the same reason.
 */
function StatusFlag({ status }: { status: string }) {
  return (
    <span className="flag" data-kind={`run-${status}`}>
      {status}
    </span>
  );
}

/** Milliseconds as something a person reads: "2.8 s", "1 min 12 s". */
export function duration(ms: number | null): string {
  if (ms === null) {
    return 'still running';
  }

  if (ms < 1000) {
    return `${ms} ms`;
  }

  const seconds = ms / 1000;

  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }

  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}

function runs(count: number): string {
  return `${count} ${count === 1 ? 'run' : 'runs'}`;
}

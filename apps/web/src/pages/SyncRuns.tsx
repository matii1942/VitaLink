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
import { useText } from '../i18n/language';
import type { Strings } from '../i18n/strings';
import type { SyncRunView } from '../types';

export function SyncRuns() {
  const text = useText();
  const { data, loading, error } = useResource<SyncRunView[]>('/sync/runs');

  if (loading) {
    return <p className="state">{text.sync.loading}</p>;
  }

  if (error !== null) {
    return (
      <p className="state" data-kind="error">
        {text.sync.couldNotLoad(error.message)}
      </p>
    );
  }

  if (data === null || data.length === 0) {
    return <p className="state">{text.sync.empty}</p>;
  }

  const [latest, ...earlier] = data as [SyncRunView, ...SyncRunView[]];

  return (
    <>
      <div className="board-head">
        <h2>{text.sync.title}</h2>
        <span className="meta">{text.sync.meta(data.length)}</span>
      </div>

      <p className="lede">{text.sync.lede}</p>

      <LatestRun run={latest} />

      <Idempotence runs={data} />

      {earlier.length > 0 && (
        <section className="section">
          <h3>{text.sync.earlierRuns}</h3>
          <table className="board">
            <caption>{text.sync.earlierCaption(data.length)}</caption>
            <thead>
              <tr>
                <th scope="col">{text.sync.columns.started}</th>
                <th scope="col">{text.sync.columns.status}</th>
                <th scope="col">{text.sync.columns.took}</th>
                <th scope="col">{text.sync.columns.patients}</th>
                <th scope="col">{text.sync.columns.admissions}</th>
                <th scope="col">{text.sync.columns.observations}</th>
                <th scope="col">{text.sync.columns.rejected}</th>
                <th scope="col">{text.sync.columns.scored}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((run) => (
                <tr key={run.id}>
                  <td>{timeAgo(run.startedAt, text.time)}</td>
                  <td>
                    <StatusFlag status={run.status} />
                  </td>
                  <td className="num">{duration(run.durationMs, text.sync)}</td>
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
  const text = useText();

  return (
    <section className="card section run-latest" data-status={run.status}>
      <h3>
        {text.sync.lastRun} <StatusFlag status={run.status} />
      </h3>

      <p className="subtle">
        {text.sync.started(timeAgo(run.startedAt, text.time))}
        {run.durationMs !== null && ` · ${text.sync.took(duration(run.durationMs, text.sync))}`}
      </p>

      <dl className="tiles">
        <Tile label={text.sync.tiles.patients} value={run.patientsSynced} />
        <Tile label={text.sync.tiles.admissions} value={run.admissionsSynced} />
        <Tile label={text.sync.tiles.observations} value={run.observationsSynced} />
        <Tile label={text.sync.tiles.scored} value={run.scoresComputed} />
        <Tile
          label={text.sync.tiles.rejected}
          value={run.observationsRejected}
          kind={run.observationsRejected > 0 ? 'warn' : 'quiet'}
        />
      </dl>

      <p className="disclaimer">
        {run.observationsRejected === 0 ? text.sync.nothingDropped : text.sync.somethingDropped}
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
  const text = useText();
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
      <h3>{text.sync.twiceTitle}</h3>
      <p className="subtle">
        {same
          ? text.sync.twiceSame(newest.observationsSynced, newest.admissionsSynced)
          : text.sync.twiceDifferent(previous.observationsSynced, newest.observationsSynced)}
      </p>
    </section>
  );
}

/** What was refused, and why. Empty is an answer, so it is said out loud. */
function Rejected({ runs: history }: { runs: SyncRunView[] }) {
  const text = useText();

  const issues = history.flatMap((run) =>
    run.issues.map((issue) => ({ ...issue, runId: run.id, startedAt: run.startedAt })),
  );

  if (issues.length === 0) {
    return null;
  }

  return (
    <section className="section">
      <h3>{text.sync.rejectedTitle}</h3>
      <table className="board">
        <caption>{text.sync.rejectedCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{text.sync.rejectedColumns.when}</th>
            <th scope="col">{text.sync.rejectedColumns.record}</th>
            <th scope="col">{text.sync.rejectedColumns.field}</th>
            <th scope="col">{text.sync.rejectedColumns.reason}</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue, index) => (
            // The record identifier repeats across runs — the same bad row is
            // refused every hour — so the key pairs it with the run.
            <tr key={`${issue.runId}-${issue.record}-${index}`}>
              <td>{timeAgo(issue.startedAt, text.time)}</td>
              <td>{issue.record}</td>
              <td>{issue.field ?? '—'}</td>
              {/* The reason comes from the normaliser, in its own words. */}
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
 *
 * The word itself comes from the database, where the run recorded it. It is
 * data, so it is not translated.
 */
function StatusFlag({ status }: { status: string }) {
  return (
    <span className="flag" data-kind={`run-${status}`}>
      {status}
    </span>
  );
}

/**
 * Milliseconds as something a person reads: "2.8 s", "1 min 12 s".
 *
 * `ms`, `s` and `min` are the SI (Système International) symbols, which are
 * the same in both languages — the only word here that needs translating is
 * the one for a run that has not finished.
 */
export function duration(ms: number | null, words: Strings['sync']): string {
  if (ms === null) {
    return words.stillRunning;
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

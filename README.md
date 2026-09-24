# VitaLink

VitaLink connects a hospital's legacy patient system to modern clinical tooling. It pulls admissions and vital signs from a SOAP web service, normalises them into PostgreSQL, and scores every set of observations against the **NEWS2** early-warning standard — so that deterioration visible in the data is not left waiting for someone to notice it at shift change.

> **Status:** Sprints 0–2 complete. The integration works end to end: a sync reads every admission from the hospital, stores it, and scores every observation. The REST API for consumers, the cloud deployment and the ward dashboard are next — see the [roadmap](#roadmap).

---

## The problem

Hospitals rarely replace their core systems. They extend them. The result is a patient record that lives in software designed twenty years ago, speaking SOAP and XML, with no practical way for anything modern to read it.

The cost lands on the people at the bedside. Vital signs are recorded in one system, reviewed in another, and the connection between them is a person reading numbers at shift change. Deterioration is usually visible in the data hours before anyone acts on it — not because staff miss it, but because nobody is subtracting one round from the next across twenty patients and three shifts. Each nurse sees a number that, on its own, is tolerable. The trend is what matters, and the trend is what gets lost.

VitaLink does not replace the legacy system. It reads from it, scores what it finds against a published clinical standard, and records the result.

## What works today

- **A simulated hospital information system** that speaks SOAP 1.1 from a hand-written WSDL, serving reproducible synthetic patients whose vital signs evolve over their stay — most stable or recovering, some deteriorating the way real patients do.
- **A SOAP client** that takes its endpoint from configuration rather than the WSDL, and classifies failures: a client fault is never retried, a server fault or a dropped connection is.
- **A normaliser** that turns the legacy format into a typed clinical model — local times with no zone into UTC instants, `'36,8'` into `36.8`, `'S'`/`'N'` into booleans, Spanish codes into English values, two coexisting sex codings into one. An absent value becomes `null`; a malformed one is refused and named, never guessed.
- **A NEWS2 engine** transcribed from the Royal College of Physicians chart and verified row by row against independent sources, with a test on both sides of every band boundary.
- **A synchronisation job** that stores everything the hospital sends and scores every observation. Every write is keyed by the hospital's own identifier, so running it twice changes nothing. Every run is recorded, whether it succeeds or not.

Verified end to end on 22 September 2026: a sync of the simulator's 25 patients stores 478 observations and scores all 478, with nothing rejected. Six consecutive runs leave the same 478 rows.

## Architecture

```
┌──────────────────────┐       SOAP 1.1 / XML       ┌───────────────────────────┐
│  legacy-sim          │ ◄───────────────────────── │  NestJS API               │
│  simulated hospital  │  GetPatient                │                           │
│  CommonJS · :8080    │  ListAdmissions            │  SOAP client              │
│                      │  GetObservations           │    → normaliser           │
│                      │ ─────────────────────────► │    → NEWS2 engine         │
└──────────────────────┘                            │    → sync (POST /sync)    │
                                                    └─────────────┬─────────────┘
                                                                  │ Prisma 7
                                                                  ▼
                                                    ┌───────────────────────────┐
                                                    │  PostgreSQL 16            │
                                                    │  Patient · Admission      │
                                                    │  Observation · Score      │
                                                    │  SyncRun                  │
                                                    └───────────────────────────┘
```

The simulator is a real SOAP service with a hand-written contract — not a mock — so the integration is built against the awkward parts: `xsi:nil` fields that arrive as objects, empty lists that arrive as `null`, dates without a zone, decimals with a comma. It stands in for a system VitaLink would not control; in a real deployment it would not exist.

Inside the API, everything that knows about the legacy format lives in `src/legacy/`. The clinical model in `src/domain/` imports nothing from it. If the hospital replaced its system with an HL7 FHIR server tomorrow, `legacy/` would be rewritten and nothing else would notice.

**Design decisions worth explaining:**

Scores live in their own table rather than as columns on an observation. Observations are raw clinical data and are never modified; scores are derived, and carry the version of the engine that produced them. If the algorithm changes, history can be recomputed without touching what was recorded.

Every sync run writes a row whether it succeeds, partially succeeds or fails. An integration that quietly does nothing is the most common failure in this kind of system, and the defence is making every run visible. A run that had to refuse even one record is `partial`, not `succeeded`: green has to mean everything arrived.

Every timestamp is stored as `timestamptz`. The whole integration exists to turn a zone-less local time into an unambiguous instant; storing that instant in a zone-less column would reintroduce the problem inside our own database.

The reasoning behind these and other decisions is recorded in [`docs/decisions/`](docs/decisions/).

## Clinical scoring

**NEWS2** (National Early Warning Score 2) is the Royal College of Physicians' standard for detecting deterioration in adults on general wards. Seven parameters each score 0 to 3, and the aggregate drives a defined clinical response.

| Parameter | 3 | 2 | 1 | **0** | 1 | 2 | 3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Respiration rate | ≤ 8 | | 9–11 | **12–20** | | 21–24 | ≥ 25 |
| SpO₂ scale 1 | ≤ 91 | 92–93 | 94–95 | **≥ 96** | | | |
| SpO₂ scale 2 | ≤ 83 | 84–85 | 86–87 | **88–92**, or ≥ 93 on air | 93–94 on O₂ | 95–96 on O₂ | ≥ 97 on O₂ |
| Air or oxygen | | Oxygen | | **Air** | | | |
| Systolic BP | ≤ 90 | 91–100 | 101–110 | **111–219** | | | ≥ 220 |
| Pulse | ≤ 40 | | 41–50 | **51–90** | 91–110 | 111–130 | ≥ 131 |
| Consciousness | | | | **Alert** | | | C, V, P or U |
| Temperature | ≤ 35.0 | | 35.1–36.0 | **36.1–38.0** | 38.1–39.0 | ≥ 39.1 | |

| Aggregate | Risk | Response |
| --- | --- | --- |
| 0–4 | Low | Ward-based response |
| 3 in any single parameter | Low–medium | Urgent ward-based response |
| 5–6 | Medium | Key threshold for urgent response |
| 7 or more | High | Urgent or emergency response |

**How the table was verified.** It was transcribed from the RCP's published charts and checked against four sources before any code was written. The check mattered: two of the first three automated readings of the PDF charts were wrong, having misaligned the columns and assumed a symmetry the chart does not have. A majority of them put a temperature of 39.1 °C at 3 points; it is 2. See [ADR 0005](docs/decisions/0005-news2-is-implemented-as-published.md).

**Scale 2** is for patients in chronic hypercapnic respiratory failure — in practice, advanced COPD — whose target saturation is 88–92%. For them, more oxygen causes harm, which is why a high saturation reached on oxygen scores. The scale is a clinical decision recorded against the patient, and VitaLink never infers it from other data. See [ADR 0003](docs/decisions/0003-news2-scale-is-received-not-inferred.md).

**Consciousness** arrives as a Glasgow Coma Scale — which is what the ward actually charts — and is converted to ACVPU from its components, never its total. See [ADR 0006](docs/decisions/0006-glasgow-to-acvpu-mapping.md).

## Known limitations

These are stated so that nobody mistakes a number VitaLink produces for more than it is.

- **Pregnancy and spinal cord injury cannot be excluded.** NEWS2 should not be used in pregnancy and may be unreliable after spinal cord injury. The hospital's contract carries neither, so VitaLink cannot know it is scoring such a patient. Patients under 16, whose date of birth VitaLink does have, are not scored.
- **Hypertension below 220 mmHg scores 0.** This is a property of NEWS2, implemented as published. A score of 0 is not a finding that the pressure is fine.
- **Long-standing low verbal responses read as new confusion.** Dementia, aphasia or motor neurone disease lower the Glasgow verbal score permanently, and the conversion reads it as C, adding 3 points at every round. A ward nurse reads a Glasgow against the patient's baseline; the source does not send one.
- **Scores can be partial.** A missing measurement leaves its parameter unscored, and the score is marked as a lower bound. Over the simulated ward, roughly a third of scores are partial — every parameter goes missing only occasionally, but the gaps add up.
- **Ward data stops where critical care begins.** An admission has three states: in a bed, waiting for a critical care bed, and ended with a recorded destination. A patient at or above the emergency response threshold for two consecutive rounds has a bed asked for, and stays on the board — above every score — until it appears. Measured over 600 simulated patients, no admission that was never escalated exceeds an aggregate of 9. Nothing here is validated against critical care physiology, and it is not meant to be. See [ADR 0009](docs/decisions/0009-ward-data-stops-at-critical-care.md).
- **The ward board is one hand-written query, and it was measured rather than argued about.** A lateral join beats `DISTINCT ON` by 2.9× at 56 000 observations, and the gap widens with history; no index was added for it, because the sequential scan it would replace is 2.3% of the query. See [ADR 0010](docs/decisions/0010-ward-board-query-measured.md).
- **The API never returns national identity numbers.** They are stored and matched on, and they stop at the service boundary while there is no authentication. See [ADR 0008](docs/decisions/0008-api-does-not-serve-national-ids.md).
- **Two dependency advisories are accepted.** `npm audit` reports four high-severity issues from the Prisma CLI; none is reachable in this project. See [ADR 0007](docs/decisions/0007-accepted-dependency-advisories.md).

## Tech stack

| Layer | Technology |
| --- | --- |
| API | NestJS 12, TypeScript 6 (strict), ES modules |
| Database | PostgreSQL 16, Prisma 7 with the `pg` driver adapter |
| Integration | SOAP 1.1, WSDL, node-soap |
| Hospital simulator | Node.js, CommonJS, Faker |
| Testing | Vitest, Supertest |
| Tooling | Docker Compose, GitHub Actions, oxlint |
| *Planned* | AWS (Lambda, RDS, EventBridge, S3, CloudWatch), React dashboard |

## Running locally

**Requirements:** Node.js 22, Docker Desktop, Git.

```bash
git clone https://github.com/matii1942/VitaLink.git
cd VitaLink

cp .env.example .env                        # PowerShell: Copy-Item .env.example .env
cp .env.test.example .env.test              # only needed to run the tests
docker compose up -d --build                # PostgreSQL and the hospital simulator

cd apps/api
npm ci
npx prisma migrate dev            # creates the tables
npx prisma generate               # Prisma 7 no longer does this automatically
npm run start:dev
```

Then, from another terminal:

```bash
curl -X POST http://localhost:3000/sync     # PowerShell: Invoke-RestMethod -Method Post http://localhost:3000/sync
```

| Address | What it is |
| --- | --- |
| `http://localhost:8080/hospital?wsdl` | The simulated hospital's SOAP contract |
| `http://localhost:3000/health` | API health check |
| `POST http://localhost:3000/sync` | Runs a synchronisation |
| `http://localhost:3000/sync/runs` | The ten most recent runs |
| `http://localhost:3000/patients` | Patients, paginated: `?page=1&pageSize=25` |
| `http://localhost:3000/patients/{mrn}` | One patient with their admission history |
| `http://localhost:3000/admissions` | Admissions, filterable: `?ward=surgery&active=true` |
| `http://localhost:3000/admissions/{id}/observations` | Vital signs with their NEWS2 score: `?order=asc` |
| `http://localhost:3000/wards` | The wards, with how many beds are occupied |
| `http://localhost:3000/wards/{ward}/board` | Everyone in the ward with their latest score, most concerning first |

`npx prisma studio`, from `apps/api`, opens a browser view of the database.

The simulated hospital's size and seed are configuration, not code:
`LEGACY_SIM_PATIENTS` and `LEGACY_SIM_SEED` in `.env`. The default 25 patients
is a demo. Raise it to a few hundred before measuring a query — on a table small
enough to read whole, PostgreSQL ignores every index, quite correctly, and the
plan you measure is not the plan you would run.

## Testing

```bash
cd apps/api
npm test            # unit tests — no database, no network
npm run test:e2e    # boots the application against a real PostgreSQL
npm run test:cov    # unit tests with a coverage report

cd ../legacy-sim
npm test            # generator, legacy format, and the SOAP service over real SOAP
```

The end-to-end tests use a second database, `vitalink_test`, on the same
PostgreSQL container. They create it and apply the migrations on first run, and
empty every table between test cases — which is why they refuse to start unless
the database name ends in `_test`. `.env.test` is what points them at it.

The NEWS2 engine is a pure module — vital signs in, score out, no database or clock — which is what makes exhaustive testing possible. It has 80 tests, including one on each side of every band boundary, because in a clinical score the errors live at the edges. The normaliser's tests run against records captured from the simulator's actual output, not invented ones.

CI runs both packages in parallel on every push, and builds the simulator's Docker image from a clean checkout. The API job starts its own PostgreSQL container, so the end-to-end tests run against a real database there too, not a mock.

## Roadmap

| Sprint | Focus | |
| --- | --- | --- |
| 0 | Repository, Docker, CI, health endpoint | ✅ |
| 1 | Simulated hospital: WSDL, SOAP service, synthetic data generator | ✅ |
| 2 | SOAP client, normaliser, NEWS2 engine, Prisma, synchronisation | ✅ |
| 3 | REST API for consumers, integration tests on PostgreSQL, query optimisation | ✅ |
| 4 | AWS deployment, scheduled sync, infrastructure as code | |
| 5 | Clinical summaries with token-budgeted LLM calls | |
| 6 | React ward dashboard | |

## About the data

All patient data in this project is **synthetic**, generated with Faker. No real clinical data is used anywhere in this repository, and none ever will be. Health data is protected information, and a public repository is the wrong place for it under any circumstances.

## License

MIT

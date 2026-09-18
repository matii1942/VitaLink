VitaLink

VitaLink connects a hospital's legacy patient system to modern clinical tooling. It pulls admissions and observations from a SOAP web service, normalizes them into PostgreSQL, scores each set of vital signs against the NEWS2 early-warning standard, and exposes the result through a REST API and a ward dashboard — so that a nurse can see, at a glance, which patients deteriorated overnight.

> **Status:** Sprint 0 — foundations. This project is under active development; see the [roadmap](#roadmap) below.

---

## The problem

Hospitals rarely replace their core systems. They extend them. The result is a patient record that lives in software designed twenty years ago, speaking SOAP and XML, with no practical way for anything modern to read it.

The cost lands on the people at the bedside. Vital signs are recorded in one system, reviewed in another, and the connection between them is a person retyping numbers at shift change. Deterioration is usually visible in the data hours before anyone acts on it — not because staff miss it, but because nothing is watching the trend continuously while they attend to twenty other patients.

VitaLink does not replace the legacy system. It reads from it, scores what it finds against a published clinical standard, and surfaces the patients who need attention first.

## What it does

- Pulls patients, admissions and observations from a legacy SOAP service on an hourly schedule
- Normalizes inconsistent legacy formats — string dates, nullable fields, non-standard sex codes — into a typed relational model
- Scores every set of vital signs against **NEWS2**, storing the aggregate score and the per-parameter breakdown
- Raises alerts when a score crosses the escalation thresholds, or when any single parameter hits its maximum
- Records every synchronization run, so a failed or partial import is visible instead of silent
- Exposes patients, admissions, observations, scores and alerts through a documented REST API
- Presents a ward view showing current risk and how it has moved over the last 24 hours

## Architecture

```
┌──────────────────────┐        SOAP 1.1 / XML          ┌─────────────────────┐
│  legacy-sim service  │ ◄───────────────────────────── │   sync worker       │
│  (Node + soap + WSDL)│   GetPatient, ListAdmissions,  │   (Lambda, hourly)  │
│  simulates the       │   GetObservations              │                     │
│  hospital's old HIS  │ ─────────────────────────────► │   parses, validates │
└──────────────────────┘                                └──────────┬──────────┘
                                                                   │ Prisma
                                                                   ▼
┌──────────────────────┐         REST / JSON            ┌─────────────────────┐
│   React dashboard    │ ◄───────────────────────────── │   NestJS API        │
│   (Vite + TS)        │   /patients /admissions        │   + NEWS2 engine    │
│                      │   /observations /alerts        │                     │
└──────────────────────┘                                └──────────┬──────────┘
                                                                   ▼
                                                        ┌─────────────────────┐
                                                        │  PostgreSQL (RDS)   │
                                                        │  + S3 for reports   │
                                                        └─────────────────────┘
```

Three deployable pieces in one repository. The legacy simulator is a real SOAP service with a hand-written WSDL — not a mock — so the integration layer is built against an actual contract, including the awkward parts.

**Two design decisions worth explaining:**

Scores live in their own table rather than as columns on an observation. Scores are derived data; raw observations are not. Keeping them separate means the scoring algorithm can change and history can be recomputed without ever touching the original clinical record.

Every sync run writes a row whether it succeeds or fails. An integration job that quietly does nothing is the most common failure mode in this kind of system, and the only defence is making each run visible.

## Tech stack

| Layer | Technology |
| --- | --- |
| API | NestJS, TypeScript |
| Database | PostgreSQL, Prisma |
| Integration | SOAP (node-soap), WSDL, XML |
| Validation | Zod |
| Testing | Vitest, Supertest, Testcontainers |
| Cloud | AWS — Lambda, S3, RDS, EventBridge, CloudWatch |
| Frontend | React, TypeScript, Vite |
| Tooling | Docker Compose, GitHub Actions |

## Clinical scoring

> **Note:** this section describes the intended implementation. Verify every threshold against the official Royal College of Physicians NEWS2 documentation before relying on it.

**NEWS2** (National Early Warning Score 2) is the UK Royal College of Physicians standard for detecting clinical deterioration in adult patients. It scores seven physiological parameters, each from 0 to 3, and the aggregate drives a defined escalation response.

| Parameter | Measured as |
| --- | --- |
| Respiration rate | breaths per minute |
| Oxygen saturation | SpO₂ %, with a separate scale for patients with hypercapnic respiratory failure |
| Supplemental oxygen | air or oxygen |
| Systolic blood pressure | mmHg |
| Pulse | beats per minute |
| Consciousness | ACVPU — alert, confusion, voice, pain, unresponsive |
| Temperature | °C |

The aggregate score maps to a clinical response: low scores mean routine monitoring, middle scores an urgent review, high scores an emergency response. A maximum score in any single parameter also triggers review, even when the total is otherwise low — a patient can be critically unwell in one axis while looking unremarkable overall.

Implementing a published standard rather than inventing thresholds is a deliberate choice. It means the scoring logic is verifiable against a public specification, it behaves the way clinical staff already expect, and every edge case has a documented correct answer to test against.

## Running locally

**Requirements:** Node.js 22, Docker Desktop, Git.

```bash
git clone https://github.com/matii1942/VitaLink.git
cd VitaLink

cp .env.example .env        # PowerShell: Copy-Item .env.example .env
docker compose up -d        # starts PostgreSQL

cd apps/api
npm ci
npx prisma migrate dev
npm run start:dev
```

The API is then available at `http://localhost:3000`, with a health check at `/health`.

```bash
npm test                    # run the test suite
npm run test:coverage       # with a coverage report
```

> Verified end to end at the close of Sprint 0.

## Testing

Business logic is tested in isolation and endpoints are tested against a real, disposable PostgreSQL instance.

The NEWS2 engine is a pure module — no database, no network, inputs to score — which makes exhaustive testing of every threshold and boundary straightforward. That is the part of this system where a wrong answer matters most, so it is the part held to the highest coverage.

## Roadmap

| Sprint | Focus |
| --- | --- |
| 0 | Repository, Docker, Prisma, CI — *in progress* |
| 1 | Legacy SOAP service, WSDL, synthetic data generator |
| 2 | SOAP client, synchronization, NEWS2 engine |
| 3 | REST API, integration tests, query optimization |
| 4 | AWS deployment, infrastructure as code |
| 5 | Clinical summaries with token-budgeted LLM calls |
| 6 | React dashboard |

## About the data

All patient data in this project is **synthetic**, generated with Faker. No real clinical data is used anywhere in this repository, and none ever will be. Health data is protected information, and a public repository is the wrong place for it under any circumstances.

## License

MIT

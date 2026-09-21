# ADR 0007 — Two dependency advisories are accepted, not force-fixed

- **Status:** Accepted
- **Date:** 2026-09-22

## Context

After installing Prisma 7.10.0, `npm audit` in apps/api reports four
high-severity advisories, all arriving through the Prisma CLI:

- **mysql2 ≤ 3.23.0** — an authentication-plugin downgrade that can leak a
  plaintext password, and an unbounded decompression in the compressed
  protocol handler.
- **deepmerge-ts < 8.0.0** — stack exhaustion when merging recursive object
  graphs, reached through `@prisma/config`.

`npm audit fix --force` offers to resolve them by installing
`prisma@6.19.3`. The affected range runs from 6.13 up to and including the 8.x
release candidates, so no newer Prisma fixes them; the only "fix" npm can find
is going back to before they existed. Prisma 6 would break the generator, the
configuration file and the PostgreSQL adapter this project is built on.

## Decision

The advisories are accepted. `npm audit fix --force` is not run.

The reasoning is about reachability, not severity:

- mysql2 is the MySQL driver. VitaLink uses PostgreSQL; the vulnerable code
  never connects to anything.
- deepmerge-ts merges the Prisma configuration file, which is a small flat
  object written in this repository. Exploiting it requires controlling
  prisma.config.ts, and anyone who can do that already controls the machine.
- Both sit in the Prisma CLI, a development dependency. Neither reaches a
  production image.

## Consequences

`npm audit` will keep reporting four high-severity issues. That is expected,
and this record is the explanation for anyone who sees it.

The decision is revisited when Prisma publishes a 7.x release with updated
dependencies — at which point `npm update` should clear the report — or if
VitaLink ever adds a MySQL connection or starts loading configuration from
untrusted input.

A reported advisory is assessed for whether the vulnerable code is reachable
in this project. It is not closed by accepting whatever an automated fix
offers, which here would have been a silent downgrade across a major version.

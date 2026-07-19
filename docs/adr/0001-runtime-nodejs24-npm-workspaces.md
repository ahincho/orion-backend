# 0001 - Runtime Node.js 24.x LTS (Krypton) + npm workspaces

- Status: Accepted (2026-06-30, during repo bootstrap)
- Deciders: @ahincho
- Supersedes: -

## Context and Problem Statement

The runtime determines the Lambda tier available, the TypeScript version, the
behavior of `node:crypto`, the ESM/CJS support, and the boundaries for npm
workspaces. We need to pick a Node version that will be supported throughout
the bootstrap phase and that matches the AWS Lambda runtime tier
selection.

## Decision

- **Runtime:** Node.js 24.x (LTS "Krypton"), supported on AWS Lambda
  (current tier: `nodejs24.x`, EOL April 2028).
- **Package manager:** npm with **workspaces** (multi-package). Three
  workspaces: `@orion/shared`, `@orion/context-authorizer`,
  `@orion/context-identity`, `@orion/context-census`. A root
  `package.json` hoists dev-dependencies and scripts.
- **Module format:** ESM (`"type": "module"`) at root and in each workspace.
- **TypeScript:** 5.7 strict mode with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`.

## Consequences

### Positive

- Stable for ~2 years (Krypton LTS schedule) so the bootstrap is not forced
  to upgrade mid-sprint.
- Built-in `node:crypto` includes scrypt, timingSafeEqual and `webcrypto`,
  removing the need for `bcrypt`, `jose`, etc. on the encryption side.
- npm workspaces keep the cross-package TypeScript walking cheap
  (`tsc -b` once at root builds everything in dependency order).
- ESM allows future migration to native ESM AWS Lambda without rewriting
  handlers.

### Negative

- Node 24 is not the LTS some teams are used to (18/20); we carry the cost
  of any tooling churn that arrives first on 24 (Powertools, Middy,
  aws-sdk v3 sometimes lag).
- npm workspaces do not have a `verdaccio`-equivalent out of the box; we
  rely on the public registry for transitive deps. Acceptable for a solo
  bootstrap.
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` turn small
  oversights into TS errors. Budgeted overhead for clarity.

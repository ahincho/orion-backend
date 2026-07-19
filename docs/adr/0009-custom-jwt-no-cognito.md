# 0009 - Custom HS256 JWT + Secrets Manager (no Cognito)

- Status: Accepted (2026-06-30, during repo bootstrap; reaffirmed PR #4)
- Deciders: @ahincho
- Supersedes: -

## Context and Problem Statement

The Lambda Authorizer needs to validate a JWT carried in
`Authorization: Bearer ...`. The candidates:

1. **AWS Cognito User Pool** with API Gateway's built-in JWT validation
   (RS256, JWKS managed by AWS).
2. **Self-signed JWT** (HS256) using a shared secret stored in
   Secrets Manager.

We need to integrate with a Postgres-hosted user table that is also the
source for FKs across bounded contexts (`census.homes.assigned_user_id`
to `identity.users.id`).

## Decision

- **Algorithm:** HS256.
- **Signing key:** stored in AWS Secrets Manager at
  `/orion/secret/jwt-arn` (ARN retrieved by the Lambda Authorizer on
  cold start).
- **Claims:** `sub` (user id), `email`, `role`, `iat`, `nbf`, `exp`,
  `jti`.
- **Sign / verify:** `jose` library (small, well-maintained, ESM-native).
- **TTL:** 1 hour access token (refresh tokens deferred to Phase 2+).

## Why not Cognito

- Cognito stores users in AWS; we need `identity.users` to live in
  PostgreSQL so other bounded contexts can FK into it.
- Cognito's pricing grows with MAU; the bootstrap does not need that.
- HS256 with a rotated secret + short `exp` is sufficient for the
  bootstrap's threat model.
- Cognito's managed UI is unnecessary; the front-end's own registration
  flows are sufficient.

## Why jose

- ESM-native, no native dependencies, supports HS256 + RS256 + JWS +
  JWK in the same package.
- Smaller than `jsonwebtoken` and kept current with the IETF drafts.

## Consequences

### Positive

- One source of truth for user identity (the `identity.users` table in
  PostgreSQL).
- Free of Cognito's MAU pricing.
- Secrets Manager rotation hook is straightforward (subscribe to
  rotation event, refresh in-memory secret cache, re-deploy Lambdas
  via gradual alias shift).

### Negative

- Self-rotation of HS256 keys is annoying (every active session breaks
  at once). Workaround: dual-secret support for a rolling grace
  window (Phase 2+).
- Token revocation needs a separate store (`revoked_jti`) until the
  short-TTL grace catches up.
- Need to operate our own password-reset flow (Cognito would have
  given this for free).

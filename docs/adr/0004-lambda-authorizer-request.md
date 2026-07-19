# 0004 - Lambda Authorizer (REQUEST) for custom JWT authentication

- Status: Accepted (2026-06-30, during repo bootstrap)
- Deciders: @ahincho
- Supersedes: -

## Context and Problem Statement

Authentication must be enforced on every route except public identity
endpoints (`POST /v1/identity/register`, `POST /v1/identity/login`).
The candidate approaches are:

1. **Lambda Authorizer** in API Gateway (REST API) or HTTP API v2 (both
   `REQUEST` and `SIMPLE` types).
2. **Cognito User Pool Authorizer** (only on REST API, only JWT
   validation).
3. **Custom authorizer via JWT validation inside the Lambda** (no
   API Gateway authorizer).

## Decision

We use **Lambda Authorizer of type `REQUEST`** on every protected
route, exposed via a single Lambda in `contexts/authorizer/`.

- The authorizer Lambda decodes the `Authorization: Bearer <jwt>`
  header and verifies the HS256 signature against the secret stored in
  Secrets Manager (`/orion/secret/jwt-arn`).
- It validates `exp`, `iat`, `nbf` (with a small clock skew).
- On success it returns
  `{ isAuthorized: true, context: { userId, email, role } }` using
  `APIGatewaySimpleAuthorizerWithContextResult<AuthorizerContext>`.
- API Gateway forwards `event.requestContext.authorizer.lambda` to the
  business Lambda; `requireAuth()` in `@orion/shared` reads it.

## Why not Cognito

- Cognito locks us into AWS user storage, managed UI, and pricing we do
  not need for a bootstrap.
- Cognito does not support HS256 (only RS256 with managed JWKS); the
  project uses HS256 because the signing key lives in Secrets Manager
  and rotates with the rest of our secrets.
- The bootstrap needs a `users` table in PostgreSQL anyway (FK
  relationships from `census.homes.assigned_user_id` etc.). Putting
  the user store in Cognito and then mirroring it in PostgreSQL would
  duplicate the data.

## Why REQUEST (not SIMPLE) authorizer

- SIMPLE authorizer returns only `isAuthorized: bool` (no context).
  We need to pass `userId` to downstream Lambdas to avoid a second DB
  hit per request.

## Why not Lambda-level JWT validation only

- Authentication logic must run before API Gateway dispatches; otherwise
  we waste Lambda execution on requests that will be rejected, and the
  Metrics/Logger are polluted with auth-failed traces for unauthenticated
  traffic that never qualified as business requests.

## Consequences

### Positive

- One authorizer Lambda for the whole API; easy to add (e.g.) a
  permission check, request-rate memo, or audit emission.
- `AuthorizerContext` (with `userId`, `email`, `role`) is available in
  every business Lambda without a second DB lookup.
- Removing Cognito removes one billing line item and one set of AWS
  console flows.

### Negative

- The authorizer Lambda is invoked once per protected request; cached
  for ~5 minutes by HTTP API when its response includes
  `identitySource`. We rely on the cache to keep the JWT verify cost
  paid only once per session.
- Custom authorizer has no built-in token-revocation flow; revocation
  is implemented at the JWT layer (short `exp`) plus an optional
  `revoked_jti` table for explicit logout (Phase 2+).

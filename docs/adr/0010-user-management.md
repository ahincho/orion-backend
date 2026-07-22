# 0010 - Administrative user-management endpoints (3-tier RBAC)

- Status: Accepted (2026-07-22, during PR #119 / Stage 3)
- Deciders: @ahincho
- Supersedes: implicit RBAC decisions in ADR 0009 (which only covered JWT issuance)

## Context and Problem Statement

After ADR 0009 (custom JWT, no Cognito), the identity context owns
`identity.users` and issues HS256 tokens carrying `sub`, `email`, `role`.
The original bootstrap shipped only `register`, `login`, `get-me`, and
`change-password` — enough for a single-user system, not enough for a
multi-role product.

The product now needs an admin surface for:
- Listing users (with pagination + filtering by role / active flag).
- Reading a single user's profile by id.
- Updating user fields (email, fullName, role, active).
- Deactivating and reactivating users (soft delete — preserves FK history).
- Renaming the self-service profile routes (`/v1/users/me` →
  `/v1/auth/me`, `/v1/users/me/password` → `/v1/auth/change-password`)
  so the literal `{userId}` segment cannot shadow the admin
  `GET /v1/users/{userId}` route.

Role taxonomy (Stage 2, PRs #117 and #118): three values, enforced by a
CHECK constraint in `identity.users.role`:
- `advisor` — top tier; full CRUD on all users.
- `supervisor` — middle tier; CRUD only on `agent` targets.
- `agent` — bottom tier; no admin endpoints.

## Decision

Add 5 new Lambda handlers in `contexts/identity/src/handlers/`:

| HTTP                   | Path                                  | Authz                        |
| ---------------------- | ------------------------------------- | ---------------------------- |
| `GET /v1/users`        | list paginated + filterable users     | advisor (any); supervisor (forced agent); agent 403 |
| `GET /v1/users/{id}`   | fetch one user                        | advisor (any); supervisor (agent only); agent (self only) |
| `PATCH /v1/users/{id}` | partial update (email/fullName/role/active) | per-field, see rules below |
| `POST /v1/users/{id}/deactivate` | set `active=false` (soft delete) | advisor (any except self); supervisor (agent only, no self); agent 403 |
| `POST /v1/users/{id}/activate`   | set `active=true`               | advisor (any); supervisor (agent only); agent 403 |

All five share the same IAM role + VPC config as the existing
`Identity*Function`s and are wired via raw `AWS::ApiGatewayV2::Route`
resources in the root `template.yaml` (the SAM-nested-stacks quirk
already documented in the root template header).

### Self rules (universal, apply to every role)

- No self-deactivation (`POST .../{id}/deactivate` when `id === requesterId`).
- No self role change (`PATCH /v1/users/{id}` with `role` set when
  `id === requesterId`).
- No self management of the own `active` flag (any value, even same).
- Self **can** change own `email` and `fullName`.
- Self **can** be re-activated by another admin (activate has no
  self-rule; supervisors/advisors may re-enable a previously-deactivated
  user including themselves).

### Authorization matrix (authorization failures surface as
`ApiError.forbidden` with structured `ErrorDetail[]` codes)

- `auth.role_required` (code) — requester role cannot perform this
  action at all (e.g. `agent` calling any admin endpoint).
- `auth.role_mismatch` — requester may manage *some* users but not this
  target (e.g. `supervisor` trying to update an `advisor`).
- `user.self_deactivation` / `user.self_role_change` /
  `user.self_managed_field` — the universal self rules.

### Response envelope

List responses use a new shared envelope
(`shared/src/http/paginated.ts:buildPaginatedResponse`):

```ts
{
  items: PublicUser[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}
```

`pagination.total` comes from a parallel `SELECT count(*)` over the same
filter expression; the kysely query builder is reused for both queries so
they cannot drift.

### Domain event

A new `UserUpdatedEvent` (Zod schema in
`contexts/identity/src/domain/events.ts`) is emitted for any state
change (PATCH, activate, deactivate). It carries `changedBy`
(requesterId) and only the fields that actually changed. The
event-level refinement requires at least one changed field, so silent
no-op calls (e.g. `PATCH /v1/users/{id}` with empty body — already
blocked at the schema layer with a `refine`) cannot produce empty
events.

### Route rename (breaking)

`GET /v1/users/me` → `GET /v1/auth/me` and
`POST /v1/users/me/password` → `POST /v1/auth/change-password`. The
literal `/me` segment in the old path was incompatible with the new
`{userId}` path parameter. The Lambda handlers (`IdentityGetMeFunction`,
`IdentityChangePasswordFunction`) are reused — only the API Gateway
`RouteKey` changes.

## Why split into 5 handlers instead of one `users.ts` dispatcher

- One Lambda per route keeps memory + timeout independent (heavy list
  queries don't affect the cheap `getById` Lambda).
- Aligns with the existing convention (`register.ts`, `login.ts`,
  `get-me.ts`, `change-password.ts`) and the SAM
  `one-Lambda-per-route` pattern already documented in AGENTS.md.
- Future per-handler tuning (memory, provisioned concurrency,
  reserved concurrency) is trivial.

## Why soft delete (deactivate) instead of DELETE

- Preserves FKs from `census.homes.assigned_to`,
  `census.assignments.assignee_id`, and `census.assignments.assigned_by`.
- Enables audit / forensic analysis (last visit, last assignment, who
  deactivated whom).
- `authenticate` already refuses `active = false` rows, so deactivated
  users cannot log in.

## Consequences

### Positive

- Clean admin surface with predictable, testable authorization rules.
- Self-* invariants enforced server-side (not just convention).
- Pagination + filtering keep the list endpoint usable at scale
  (`perPage` clamped to `[1, 100]`, default 20).
- Standardized `ErrorDetail[]` codes (`auth.role_required`,
  `auth.role_mismatch`, `user.self_*`) let clients dispatch without
  parsing message strings.

### Negative

- 5 new Lambdas (and 5 new IAM permissions + 5 new
  `AWS::ApiGatewayV2::Route` resources) increase stack surface; cold
  start cost per route is paid individually.
- JWT tokens issued before the role-rename deploy still carry the
  pre-rename role names (`asesor`, `distribuidor`); the V009 backfill
  handles existing DB rows, but in-flight tokens will fail
  authorization checks until re-login. For dev this is acceptable.
- Front-end (`orion-frontend`) must be updated to consume the renamed
  `/v1/auth/me` and `/v1/auth/change-password` routes. Tracked as a
  follow-up after PR #119.

## References

- `contexts/identity/src/schemas/{pagination,user-id-param,list-users,update-user}.schema.ts`
- `contexts/identity/src/handlers/{list-users,get-user,update-user,deactivate-user,activate-user}.ts`
- `contexts/identity/src/service/user-service.ts` — `assertCanManageTarget`,
  `assertNotSelfAction`, `listUsers`, `getUser`, `updateUser`,
  `deactivateUser`, `activateUser`
- `contexts/identity/src/domain/events.ts` — `UserUpdatedEvent`
- `shared/src/http/paginated.ts` — `buildPaginatedResponse`
- `contexts/identity/template.yaml` — 5 new `Identity*Function` resources
- `template.yaml` — 5 new Integrations + Routes + Permissions + route
  rename
- `migrations/V009__restrict_user_role_to_advisor_supervisor_agent.sql`
- AGENTS.md → "RBAC (3-tier)" section
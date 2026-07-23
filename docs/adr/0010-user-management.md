# 0010 - Endpoints administrativos de gestión de usuarios (RBAC 3-tier)

- Estado: Aceptado (2026-07-22, durante PR #119 / Stage 3)
- Deciders: @ahincho
- Supersedes: decisiones implícitas de RBAC en ADR 0009 (que solo
  cubría la emisión de JWT)

## Contexto y problema

Después de ADR 0009 (JWT custom, sin Cognito), el contexto identity
es dueño de `identity.users` y emite tokens HS256 que llevan `sub`,
`email`, `role`. El bootstrap original despachó solo `register`,
`login`, `get-me` y `change-password` — alcanza para un sistema
single-user, no para un producto multi-rol.

El producto ahora necesita una superficie admin para:
- Listar usuarios (con paginación + filtrado por rol / flag `active`).
- Leer el perfil de un usuario por id.
- Actualizar campos del usuario (email, fullName, role, active).
- Desactivar y reactivar usuarios (soft delete — preserva historial
  de FKs).
- Renombrar las rutas self-service (`/v1/users/me` →
  `/v1/auth/me`, `/v1/users/me/password` → `/v1/auth/change-password`)
  para que el segmento literal `{userId}` no shadowee a la ruta admin
  `GET /v1/users/{userId}`.

Taxonomía de roles (Stage 2, PRs #117 y #118): tres valores,
enforced por una constraint CHECK en `identity.users.role`:
- `advisor` — tier alto; CRUD completo sobre todos los usuarios.
- `supervisor` — tier medio; CRUD solo sobre targets con rol
  `agent`.
- `agent` — tier bajo; sin endpoints administrativos.

## Decisión

Agregamos 5 nuevos handlers Lambda en `contexts/identity/src/handlers/`:

| HTTP                              | Path                                  | Authz                            |
| --------------------------------- | ------------------------------------- | -------------------------------- |
| `GET /v1/users`                   | listar usuarios paginados + filtrables | advisor (cualquiera); supervisor (forzado a agent); agent 403 |
| `GET /v1/users/{id}`              | obtener un usuario                    | advisor (cualquiera); supervisor (agent solo); agent (solo self) |
| `PATCH /v1/users/{id}`            | update parcial (email/fullName/role/active) | por-campo, ver reglas abajo |
| `POST /v1/users/{id}/deactivate`  | set `active=false` (soft delete)      | advisor (cualquiera salvo self); supervisor (agent solo, sin self); agent 403 |
| `POST /v1/users/{id}/activate`    | set `active=true`                     | advisor (cualquiera); supervisor (agent solo); agent 403 |

Los cinco comparten el mismo IAM role + VPC config que las
`Identity*Function`s existentes y se wirean vía raw
`AWS::ApiGatewayV2::Route` resources en el `template.yaml` raíz (el
quirk de nested-stacks SAM ya documentado en el header del template
raíz).

### Reglas de self (universales, aplican a todos los roles)

- No self-deactivation (`POST .../{id}/deactivate` cuando `id ===
  requesterId`).
- No self role change (`PATCH /v1/users/{id}` con `role` seteado
  cuando `id === requesterId`).
- No self-manage del propio flag `active` (cualquier valor, incluso
  igual).
- Self **puede** cambiar su propio `email` y `fullName`.
- Self **puede** ser reactivado por otro admin (activate no tiene
  self-rule; supervisors/advisors pueden re-habilitar a un usuario
  previamente desactivado, incluyéndose).

### Matriz de autorización (los fallos de autorización se exponen como
`ApiError.forbidden` con códigos `ErrorDetail[]` estructurados)

- `auth.role_required` (code) — el rol del requester no puede
  realizar esta acción en absoluto (ej. `agent` llamando cualquier
  endpoint admin).
- `auth.role_mismatch` — el requester puede administrar *algunos*
  usuarios pero no este target (ej. `supervisor` intentando updatear
  un `advisor`).
- `user.self_deactivation` / `user.self_role_change` /
  `user.self_managed_field` — las reglas universales de self.

### Envelope de respuesta

Las respuestas de list usan un nuevo envelope compartido
(`shared/src/http/paginated.ts:buildPaginatedResponse`):

```ts
{
  items: PublicUser[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}
```

`pagination.total` viene de un `SELECT count(*)` en paralelo sobre la
misma filter expression; el query builder de kysely se reusa para
ambas queries para que no puedan driftear.

### Evento de dominio

Un nuevo `UserUpdatedEvent` (schema Zod en
`contexts/identity/src/domain/events.ts`) se emite ante cualquier
cambio de estado (PATCH, activate, deactivate). Lleva `changedBy`
(requesterId) y solo los campos que efectivamente cambiaron. El
refine a nivel de evento exige al menos un campo cambiado, así
calls no-op silenciosas (ej. `PATCH /v1/users/{id}` con body vacío —
ya bloqueado en el schema con un `refine`) no pueden producir
eventos vacíos.

### Rename de rutas (breaking)

`GET /v1/users/me` → `GET /v1/auth/me` y
`POST /v1/users/me/password` → `POST /v1/auth/change-password`. El
segmento literal `/me` en la ruta vieja era incompatible con el
nuevo path parameter `{userId}`. Los handlers Lambda
(`IdentityGetMeFunction`, `IdentityChangePasswordFunction`) se
reusan — solo cambia el `RouteKey` de API Gateway.

## Por qué dividir en 5 handlers en lugar de un dispatcher `users.ts`

- Una Lambda por ruta mantiene memoria + timeout independientes
  (queries pesadas de listado no afectan al Lambda barato de
  `getById`).
- Se alinea con la convención existente (`register.ts`, `login.ts`,
  `get-me.ts`, `change-password.ts`) y el patrón SAM
  `one-Lambda-per-route` ya documentado en AGENTS.md.
- Tuning por handler (memoria, provisioned concurrency, reserved
  concurrency) en el futuro es trivial.

## Por qué soft delete (deactivate) en lugar de DELETE

- Preserva las FKs desde `census.homes.assigned_to`,
  `census.assignments.assignee_id` y `census.assignments.assigned_by`.
- Permite audit / análisis forense (última visita, última
  asignación, quién desactivó a quién).
- `authenticate` ya rechaza filas con `active = false`, así que los
  usuarios desactivados no pueden loguearse.

## Consecuencias

### Positivas

- Superficie admin limpia con reglas de autorización predecibles y
  testeables.
- Invariantes de self-* enforced server-side (no solo por convención).
- Paginación + filtrado mantienen usable el endpoint de listado a
  escala (`perPage` clampado a `[1, 100]`, default 20).
- Códigos `ErrorDetail[]` estandarizados (`auth.role_required`,
  `auth.role_mismatch`, `user.self_*`) permiten a los clientes
  dispatchear sin parsear message strings.

### Negativas

- 5 Lambdas nuevas (y 5 permisos IAM + 5 resources
  `AWS::ApiGatewayV2::Route`) incrementan la superficie del stack; el
  costo de cold start por ruta se paga individualmente.
- Los tokens JWT emitidos antes del deploy de role-rename todavía
  llevan los nombres de rol viejos (`asesor`, `distribuidor`); el
  backfill de V009 maneja las filas existentes en la DB, pero los
  tokens en vuelo van a fallar las verificaciones de autorización
  hasta re-login. Aceptable para dev.
- El front-end (`orion-frontend`) tiene que actualizarse para
  consumir las rutas renombradas `/v1/auth/me` y
  `/v1/auth/change-password`. Tracked como follow-up después de
  PR #119.

## Referencias

- `contexts/identity/src/schemas/{pagination,user-id-param,list-users,update-user}.schema.ts`
- `contexts/identity/src/handlers/{list-users,get-user,update-user,deactivate-user,activate-user}.ts`
- `contexts/identity/src/service/user-service.ts` —
  `assertCanManageTarget`, `assertNotSelfAction`, `listUsers`,
  `getUser`, `updateUser`, `deactivateUser`, `activateUser`
- `contexts/identity/src/domain/events.ts` — `UserUpdatedEvent`
- `shared/src/http/paginated.ts` — `buildPaginatedResponse`
- `contexts/identity/template.yaml` — 5 nuevos resources
  `Identity*Function`
- `template.yaml` — 5 nuevas Integrations + Routes + Permissions +
  rename de rutas
- `migrations/V009__restrict_user_role_to_advisor_supervisor_agent.sql`
- AGENTS.md → sección "RBAC (3-tier)"

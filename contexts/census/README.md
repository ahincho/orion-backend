# `contexts/census`

ORION **P1 bounded context: Asignacion de Censos**. Owns the `census`
schema in PostgreSQL with tables `homes`, `surveys`, `assignments`.

## Lambdas

| Ruta | Metodo | Auth | Handler |
|---|---|---|---|
| `/v1/census/homes/unassigned` | GET | SI (JWT) | `list-unassigned.ts` |
| `/v1/census/assignments` | POST | SI (JWT, supervisor/admin only) | `assign.ts` |

## Domain model

- **Home**: cadastral home with PostGIS `POINT(4326)` geometry, interest
  flag, assignment state. ~3.8M rows in production.
- **Assignment**: daily booking of one home to one user. Uniqueness on
  `(home_id, scheduled_date)`.
- **Survey**: door-to-door visit outcome (interested, not_interested, etc.)
  — schema in place, handler coming in a follow-up PR.

## Events emitted

- `orion.census` source, `CensusAssigned` detail-type, version=1 envelope.

## Idempotency

`assignHome` is idempotent: if an assignment already exists for
`(homeId, scheduledDate)`, the existing one is returned without
re-creating or re-emitting events.

## Tests

5 unit tests covering assign happy/idempotent/404, list (excludes
metadata), updateAssignmentStatus happy/404.

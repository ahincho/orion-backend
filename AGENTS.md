# AGENTS.md

> Convenciones operacionales para el repo `orion-backend`. Lectura obligatoria
> antes de cada PR.

---

## Proyecto

**ORION - Sistema Cognitivo**. Repositorio parte de un monorepo de 5
repositorios coordinados (`orion-frontend`, `orion-backend`,
`orion-cognitive-agent`, `orion-article`, `orion-infrastructure`).

Este repo contiene: **backend service (API) en sprint**.

## Git Workflow (mandatory)

Single-tier branching (rapid solo project). Validar siempre que la
cuenta activa sea `ahincho`:

`
gh api user --jq .login
# o
ssh -T git@github.com
`

- `main` es la unica branch permanente. PRs van contra `main` directamente.
- Todo trabajo ocurre en una feature branch: `feat/`, `fix/`, `chore/`,
  `docs/`, `ci/`, etc.

### Lifecycle de cada cambio

1. `git fetch origin && git checkout main && git pull --ff-only origin main`.
2. `git checkout -b <type>/<scope>` desde `main`.
3. Implementar, commitear con Conventional Commits (`feat:`, `fix:`,
   `chore:`, `refactor:`, `docs:`, `test:`, `build:`, `ci:`).
4. `git push -u origin <type>/<scope>`.
5. Abrir PR **desde `<type>/<scope>` a `main`**.
6. Tras CI verde, **squash-merge a `main`**.
7. Branch borrada automaticamente por el ruleset.

### Forbidden

- Commit directo a `main` (forzado por ruleset).
- Force-push a `main` (forzado por ruleset non_fast_forward).
- Merge commits en `main` (squash-only habilitado).

## Convenciones de codigo

- Routing/nombres/identificadores en **English**; copy de UI en **Spanish**
  (solo aplica a orion-frontend).
- Commits: Conventional Commits + scope (`feat(auth): ...`).
- Tags: `git tag -a vX.Y.Z -m "release vX.Y.Z"` (semver).

## Antes de la primera iteracion

Este repo esta en bootstrap. El codigo se ira agregando en branches
`feat/<scope>` contra `main` via PR. Cada repo sigue el stack declarado
en su `README.md` y se integra con el resto via el repo
`orion-infrastructure` (infra AWS compartida, Phase 0).

## Contacto

- Owner: `@ahincho` (solo-dev).
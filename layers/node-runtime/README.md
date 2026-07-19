# `@orion/layer-node-runtime`

Lambda Layer with **runtime npm dependencies** used by every Lambda in
ORION backend. Mounted at `/opt` so modules resolve from `/opt/node_modules/`.

## Contents

- **AWS SDK v3 clients** (eventbridge, secrets-manager, ssm)
- **AWS Lambda Powertools** (logger, tracer, metrics)
- **Middy v6** (core + http middlewares: cors, error-handler, header-normalizer, json-body-parser)
- **jose** (JWT sign/verify, HS256)
- **zod** (schema validation)
- **kysely** + **pg** (typed query builder + PostgreSQL driver)

## Build

```bash
npm run build
```

Output: `../orion-node-runtime-layer.zip`

The script:
1. Cleans previous artifacts.
2. Creates `nodejs/` structure.
3. Runs `npm install --omit=dev` into `nodejs/`.
4. Prunes `.md`, `.map`, `CHANGELOG*`, and `.bin/` directories.
5. Zips from parent so the zip root contains `nodejs/`.

## Compatibility

- Runtime: `nodejs24.x`
- Size: ~10-15 MB after pruning

## When to rebuild

- When any dependency is bumped (see Dependabot PRs).
- When a new runtime dep is added (update `package.json` first).

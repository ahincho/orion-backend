# Lambda Layers

ORION backend uses **two Lambda Layers** to keep deployment packages lean
and to share code across contexts.

| Layer | Source | Purpose | Approx Size |
|---|---|---|---|
| `orion-node-shared-${Environment}` | `layers/node-shared/` | Compiled `@orion/shared` workspace (auth, http, events, infra, logger, cors, templates) | ~300 KB |
| `orion-node-runtime-${Environment}` | `layers/node-runtime/` | npm dependencies (Powertools, Middy, AWS SDK v3, jose, zod, kysely, pg) | ~12 MB |

## Build both layers

From the repo root:

```bash
npm run layer:build:all
```

This produces:
- `layers/orion-node-shared-layer.zip`
- `layers/orion-node-runtime-layer.zip`

Both zips are referenced by SAM template (`template.yaml`) via
`ContentUri`. SAM uploads them to S3 on `sam build`.

## Mount paths

When attached to a Lambda function, both layers land at `/opt`:

- `/opt/nodejs/node_modules/@orion/shared/dist/...`
- `/opt/nodejs/node_modules/<npm-pkg>/...`

Node resolves `/opt/nodejs/node_modules/` automatically when a layer is
mounted.

## Adding a new dependency

1. Add it to `layers/node-runtime/package.json` (or `shared/` if it's
   part of the shared kernel).
2. Run `npm run layer:build:all` locally to verify the build.
3. Open a PR. CI will rebuild the layers and SAM will redeploy them.

Do NOT add runtime deps to a context's `package.json` — those should
only have dev dependencies. Runtime code uses what's in the layer.

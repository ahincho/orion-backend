# `@orion/layer-node-shared`

Lambda Layer with the **compiled `@orion/shared` workspace**. This lets
every Lambda import the shared kernel without inlining it in the
deployment package.

Mounted at `/opt` so modules resolve as:
- `import { ApiError } from '@orion/shared/http'` → `/opt/node_modules/@orion/shared/dist/http/index.js`

## Build

```bash
npm run build
```

Output: `../orion-node-shared-layer.zip`

The script:
1. Cleans previous artifacts.
2. Runs `npm install` at the repo root (resolves workspace deps).
3. Compiles `shared/` via `tsc` (workspace script).
4. Copies `dist/`, `package.json` (with rewritten subpath exports) into
   `nodejs/node_modules/@orion/shared/`.
5. Prunes test files and source maps.
6. Zips.

## Compatibility

- Runtime: `nodejs24.x`
- Size: ~200-400 KB (only compiled JS + types)

## When to rebuild

- Whenever the `shared/` workspace changes.
- Run as part of `npm run layer:build:all` from the repo root.

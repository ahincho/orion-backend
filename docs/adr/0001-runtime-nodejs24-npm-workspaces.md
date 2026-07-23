# 0001 - Runtime Node.js 24.x LTS (Krypton) + npm workspaces

- Estado: Aceptado (2026-06-30, durante el bootstrap del repo)
- Deciders: @ahincho
- Supersedes: -

## Contexto y problema

El runtime determina el tier de Lambda disponible, la versión de
TypeScript, el comportamiento de `node:crypto`, el soporte de ESM/CJS y
las fronteras de los workspaces de npm. Necesitamos elegir una versión
de Node que esté soportada durante toda la fase de bootstrap y que
matchee con el tier de runtimes de AWS Lambda.

## Decisión

- **Runtime:** Node.js 24.x (LTS "Krypton"), soportado en AWS Lambda
  (tier actual: `nodejs24.x`, EOL abril 2028).
- **Package manager:** npm con **workspaces** (multi-paquete). Workspaces:
  `@orion/shared`, `@orion/context-authorizer`,
  `@orion/context-identity`, `@orion/context-census`. Un `package.json`
  raíz que hoistea dev-dependencies y scripts.
- **Formato de módulos:** ESM (`"type": "module"`) en root y en cada
  workspace.
- **TypeScript:** 5.7 en modo strict con `exactOptionalPropertyTypes` y
  `noUncheckedIndexedAccess`.

## Consecuencias

### Positivas

- Estable por ~2 años (cronograma LTS Krypton) así el bootstrap no se
  ve forzado a upgrade a mitad de sprint.
- `node:crypto` built-in incluye scrypt, timingSafeEqual y
  `webcrypto`, eliminando la necesidad de `bcrypt`, `jose`, etc. para
  la parte de encripción.
- npm workspaces mantienen barato el cross-package TypeScript walking
  (`tsc -b` una vez en root construye todo en orden de dependencia).
- ESM permite una migración futura a AWS Lambda con ESM nativo sin
  reescribir handlers.

### Negativas

- Node 24 no es el LTS al que algunos equipos están acostumbrados
  (18/20); cargamos el costo de cualquier churn de tooling que llegue
  primero a 24 (Powertools, Middy, aws-sdk v3 a veces se atrasan).
- npm workspaces no traen un equivalente de `verdaccio` out of the
  box; dependemos del registry público para las transitive deps.
  Aceptable para un bootstrap solo.
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` convierten
  pequeños descuidos en errores de TS. Overhead presupuestado en favor
  de la claridad.

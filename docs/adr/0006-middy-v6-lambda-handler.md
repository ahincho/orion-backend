# 0006 - Middy v6 con un wrapper base LambdaHandler custom

- Estado: Aceptado (2026-07-19, durante el hardening del PR #7)
- Deciders: @ahincho
- Supersedes: Middy v5 (que exponía `HandlerLambda`)

## Contexto y problema

`@middy/core` es el framework de middleware de facto para AWS Lambda en
TypeScript. v6 cambió el shape del tipo público: el alias genérico
`HandlerLambda` que exponía v5 desapareció, dejando `LambdaHandler` como
la base esperada. El bootstrap inicialmente usaba idioms de v5
(pasando `Handler` + contexto extra a `middy()`), que se rompieron
bajo `npm install` cuando se resolvió v6. Necesitamos un shape estable
de handler que:

- Sobreviva la migración de v5 -> v6 (y futuras) sin churn en cada
  bounded context.
- Codifique el orden de nuestro pipeline:
  `header-normalize -> JSON-parse -> logger-inject -> X-Ray-capture ->
  auth-check -> CORS -> handler -> error-handler -> formatResponse`.
- Permita que cada Lambda de negocio sea un wrapper delgado alrededor
  de una inner closure que recibe `(event, context, auth)`.

## Decisión

Escribimos una factory `buildHandler(config)` en `@orion/shared/templates`
que:

1. Devuelve un `Handler<...>` Lambda-compatible para AWS Lambda.
2. Internamente corre un pipeline `middy()` cuyo último middleware es
   un adaptador custom shapeado como `LambdaHandler` (middleware
   `Bridge`) que invoca una closure tipada `useCase(event, auth)`.
3. La closure `useCase` es lo único que cada bounded context escribe.
4. El pipeline se puede configurar para sumar/quitar CORS, el auth
   check o el logger-inject por handler vía un objeto de config chico.

Como `middy/http-cors@6` solo acepta `string | string[]` para su
parámetro `getOrigin` (sync), resolvemos CORS dinámicamente en la
primera invocación: cacheamos la whitelist resuelta desde SSM una sola
vez dentro del closure de `buildHandler` (cache de SSM de 5 minutos
vive en `@orion/shared`).

## Por qué este shape

- v6 de middy: el middleware adaptador es la única superficie
  estable de la que dependemos (es middleware -> ordenamiento del
  pipeline, no genéricos).
- Una handler factory para todo el backend; cada nuevo bounded context
  solo escribe la closure `useCase`, nunca el setup de middy.

## Consecuencias

### Positivas

- Future-proof: el día que salga una v7 de middy, solo `Bridge`
  necesita adaptarse, no cada Lambda.
- La resolución de CORS queda async pero cacheada, removiendo la
  restricción de "solo string o array".
- TypeScript strict mode (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`) captura mismatches en compile time.

### Negativas

- Cargamos una pequeña dependencia sobre un middleware custom que
  futuros mantenedores deben aprender (mitigado por
  `buildHandler.test.ts` + el README en `@orion/shared`).
- El wrapper es opinionado; no podemos hacer drop-in con un patrón de
  terceros de middy sin re-envolverlo. Documentado como constraint
  en `@orion/shared/README.md`.

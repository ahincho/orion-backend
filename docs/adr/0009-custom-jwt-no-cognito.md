# 0009 - JWT custom HS256 + Secrets Manager (sin Cognito)

- Estado: Aceptado (2026-06-30, durante el bootstrap del repo;
  reafirmado en PR #4)
- Deciders: @ahincho
- Supersedes: -

## Contexto y problema

El Lambda Authorizer necesita validar un JWT llevado en
`Authorization: Bearer ...`. Los candidatos:

1. **AWS Cognito User Pool** con la validación JWT built-in de API
   Gateway (RS256, JWKS administrado por AWS).
2. **JWT auto-firmado** (HS256) usando un secreto compartido
   almacenado en Secrets Manager.

Necesitamos integrar con una tabla de usuarios hosteada en
Postgres que también es la source para las FKs entre bounded contexts
(`census.homes.assigned_user_id` a `identity.users.id`).

## Decisión

- **Algoritmo:** HS256.
- **Signing key:** almacenada en AWS Secrets Manager en
  `/orion/secret/jwt-arn` (ARN recuperado por el Lambda Authorizer en
  cold start).
- **Claims:** `sub` (user id), `email`, `role`, `iat`, `nbf`, `exp`,
  `jti`.
- **Sign / verify:** librería `jose` (chica, bien mantenida, ESM-native).
- **TTL:** access token de 1 hora (refresh tokens diferidos a Phase 2+).

## Por qué no Cognito

- Cognito almacena usuarios en AWS; necesitamos que `identity.users`
  viva en PostgreSQL así otros bounded contexts pueden hacerle FK.
- El pricing de Cognito crece con MAU; el bootstrap no necesita eso.
- HS256 con un secreto rotado + `exp` corto alcanza para el threat
  model del bootstrap.
- La UI administrada de Cognito es innecesaria; los flujos de
  registro del front-end son suficientes.

## Por qué jose

- ESM-native, sin dependencias nativas, soporta HS256 + RS256 + JWS +
  JWK en el mismo paquete.
- Más chica que `jsonwebtoken` y mantenida al día con los drafts del
  IETF.

## Consecuencias

### Positivas

- Una única fuente de verdad para la identidad de usuarios (la tabla
  `identity.users` en PostgreSQL).
- Libre del pricing por MAU de Cognito.
- El hook de rotación de Secrets Manager es directo (subscripción al
  evento de rotación, refresh del cache de secreto en memoria,
  re-deploy de las Lambdas vía alias shift gradual).

### Negativas

- La auto-rotación de las claves HS256 es molesta (cada sesión
  activa se rompe de una). Workaround: dual-secret support para una
  ventana de gracia rolling (Phase 2+).
- La revocación de tokens necesita un store aparte (`revoked_jti`)
  hasta que el grace de TTL corto compense.
- Necesitamos operar nuestro propio flujo de password-reset (Cognito
  lo daría gratis).

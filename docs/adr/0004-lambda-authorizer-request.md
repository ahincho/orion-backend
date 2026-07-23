# 0004 - Lambda Authorizer (REQUEST) para autenticación JWT custom

- Estado: Aceptado (2026-06-30, durante el bootstrap del repo)
- Deciders: @ahincho
- Supersedes: -

## Contexto y problema

La autenticación debe enforcecerse en toda ruta excepto los endpoints
públicos de identity (`POST /v1/auth/register`, `POST /v1/auth/login`).
Los candidatos son:

1. **Lambda Authorizer** en API Gateway (REST API) o HTTP API v2
   (tipos `REQUEST` y `SIMPLE`).
2. **Cognito User Pool Authorizer** (solo en REST API, solo validación
   JWT).
3. **Authorizer custom vía validación JWT dentro de la Lambda** (sin
   authorizer de API Gateway).

## Decisión

Usamos **Lambda Authorizer de tipo `REQUEST`** en cada ruta protegida,
expuesto mediante una única Lambda en `contexts/authorizer/`.

- La Lambda authorizer decodifica el header `Authorization: Bearer
  <jwt>` y verifica la firma HS256 contra el secreto almacenado en
  Secrets Manager (`/orion/secret/jwt-arn`).
- Valida `exp`, `iat`, `nbf` (con un pequeño clock skew).
- En caso de éxito devuelve
  `{ isAuthorized: true, context: { userId, email, role } }` usando
  `APIGatewaySimpleAuthorizerWithContextResult<AuthorizerContext>`.
- API Gateway forwardea `event.requestContext.authorizer.lambda` a la
  Lambda de negocio; `requireAuth()` en `@orion/shared` lo lee.

## Por qué no Cognito

- Cognito nos cierra a almacenamiento de usuarios en AWS, UI
  administrada y pricing que no necesitamos para un bootstrap.
- Cognito no soporta HS256 (solo RS256 con JWKS administrado); el
  proyecto usa HS256 porque la signing key vive en Secrets Manager y
  rota junto al resto de nuestros secretos.
- El bootstrap necesita una tabla `users` en PostgreSQL de todas
  formas (relaciones FK desde `census.homes.assigned_user_id` etc.).
  Poner el user store en Cognito y después mirrorarlo en PostgreSQL
  duplicaría los datos.

## Por qué REQUEST (no SIMPLE) authorizer

- El authorizer SIMPLE devuelve solo `isAuthorized: bool` (sin
  contexto). Necesitamos pasar `userId` a las Lambdas downstream
  para evitar un segundo hit a la DB por request.

## Por qué no validación JWT a nivel de Lambda solamente

- La lógica de autenticación debe correr antes de que API Gateway
  despache; si no, gastamos ejecución de Lambda en requests que
  serán rechazados, y las Metrics/Logger se ensucian con traces de
  auth-failed para tráfico no autenticado que nunca calificó como
  request de negocio.

## Consecuencias

### Positivas

- Un authorizer Lambda para toda la API; fácil de agregarle (por ej.)
  una verificación de permisos, memo de request-rate o emisión de
  auditoría.
- `AuthorizerContext` (con `userId`, `email`, `role`) está disponible
  en cada Lambda de negocio sin un segundo lookup a la DB.
- Sacar Cognito elimina una línea de billing y un set de flujos de la
  consola AWS.

### Negativas

- La Lambda authorizer se invoca una vez por request protegida;
  cacheada por ~5 minutos por HTTP API cuando su respuesta incluye
  `identitySource`. Dependemos del cache para que el costo de
  verificación JWT se pague una sola vez por sesión.
- El authorizer custom no tiene un flujo built-in de token-revocation;
  la revocación se implementa a nivel de JWT (`exp` corto) más una
  tabla opcional `revoked_jti` para logout explícito (Phase 2+).

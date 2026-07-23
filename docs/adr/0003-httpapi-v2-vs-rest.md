# 0003 - HTTP API v2 en lugar de REST API Gateway

- Estado: Aceptado (2026-06-30, durante el bootstrap del repo)
- Deciders: @ahincho
- Supersedes: -

## Contexto y problema

API Gateway tiene dos productos: REST API (v1) y HTTP API (v2).
Necesitamos exponer un backend con rutas protegidas por JWT, soporte
de Lambda Authorizer, transformaciones custom de request/response y un
binding por handler por ruta. Las dos versiones soportan Lambda
Authorizer pero difieren en costo, feature set y shape del evento.

## Decisión

Exponemos el backend como **HTTP API v2**.

- `ApiType: HTTP` en `template.yaml`.
- Lambda Authorizer (`contexts/authorizer/`) bindeado a todas las
  rutas.
- Shape del evento: `APIGatewayProxyHandlerV2` (`event.version === '2.0'`).
- Binding por ruta por Lambda (cada ruta -> una Lambda) es enforceable
  porque cada bounded context es chico (1-4 Lambdas).

## Por qué no REST API

- REST API es ~3x más caro por millón de requests.
- REST API tiene pasos de transformación de request/response (request
  templates, integration responses) que no necesitamos porque la Lambda
  ya devuelve un body JSON que controlamos de punta a punta vía
  `buildHandler()`.
- Las integraciones de REST API con Lambda Authorizer requieren VTL;
  HTTP API v2 pasa el contexto JSON del authorizer directo a la
  integración, así que `event.requestContext.authorizer.lambda.<custom>`
  es un nivel de indirección, no dos.
- HTTP API v2 NO soporta API keys / usage plans; no los necesitamos.

## Consecuencias

### Positivas

- Menor costo y configuración más simple.
- La Lambda recibe eventos v2 con `routeKey`, `rawPath`,
  `requestContext.authorizer.lambda`, etc. directamente.
- La validación JWT puede quedarse en un Lambda Authorizer aparte (NO
  activamos la validación JWT built-in de API Gateway) porque usamos
  HS256 con un secreto de firma custom en Secrets Manager.

### Negativas

- HTTP API v2 soporta menos features que REST API (sin WAF, sin
  request validation, sin usage plans). Si el proyecto necesita WAF a
  futuro, se requerirá un Lambda-based WAF-equivalent externo o una
  distribución CloudFront delante del HTTP API.
- El evento v2 no tiene algunos campos `requestContext.identity.*` que
  sí están en v1; lo sorteamos para logging de IP/UA en Phase 2+ vía
  Middy header normalization.

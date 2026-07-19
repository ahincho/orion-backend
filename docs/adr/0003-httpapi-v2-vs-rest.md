# 0003 - HTTP API v2 instead of REST API Gateway

- Status: Accepted (2026-06-30, during repo bootstrap)
- Deciders: @ahincho
- Supersedes: -

## Context and Problem Statement

API Gateway has two products: REST API (v1) and HTTP API (v2). We need
to expose a backend with JWT-protected routes, Lambda Authorizer
support, custom request/response transformations, and a per-route
handler binding. Both versions support Lambda Authorizer, but they
differ in cost, feature set, and event shape.

## Decision

We expose the backend as **HTTP API v2**.

- `ApiType: HTTP` in `template.yaml`.
- Lambda Authorizer (`contexts/authorizer/`) bound to all routes.
- Event shape: `APIGatewayProxyHandlerV2` (`event.version === '2.0'`).
- Per-route Lambda binding (`each route -> one Lambda`) is enforceable
  because each bounded context is small (1-4 Lambdas).

## Why not REST API

- REST API is ~3x more expensive per million requests.
- REST API has request/response transformation steps (request
  templates, integration responses) that we do not need because
  Lambda already returns a JSON body we control end-to-end via
  `buildHandler()`.
- REST API integrations with Lambda Authorizer require VTL; HTTP API v2
  passes the authorizer's JSON context directly to the integration, so
  `event.requestContext.authorizer.lambda.<custom>` is one level of
  indirection, not two.
- HTTP API v2 does NOT support API keys / usage plans; not needed.

## Consequences

### Positive

- Lower cost and simpler configuration.
- Lambda receives v2 events with `routeKey`, `rawPath`,
  `requestContext.authorizer.lambda`, etc. directly.
- JWT validation can stay in a separate Lambda Authorizer (we do NOT
  enable API Gateway's built-in JWT validation) because we use HS256
  with a custom signing secret in Secrets Manager.

### Negative

- HTTP API v2 supports fewer features than REST API (no WAF, no
  request validation, no usage plans). If the project needs WAF in the
  future, an external Lambda-based WAF-equivalent or a CloudFront
  distribution in front of HTTP API will be required.
- v2 event lacks some `requestContext.identity.*` fields found in v1;
  we work around it for IP/UA logging in Phase 2+ via Middy header
  normalization.

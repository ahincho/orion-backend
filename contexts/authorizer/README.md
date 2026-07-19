# `contexts/authorizer`

ORION **Lambda Authorizer** (REQUEST type). Validates HS256 JWTs issued by
the `identity` context and attaches the decoded claims to the request so
downstream Lambdas can read them via `event.requestContext.authorizer.lambda`.

## How it works

```
Client                   API Gateway              Authorizer Lambda         Business Lambda
  │                            │                          │                         │
  │ GET /v1/users/me           │                          │                         │
  │ Authorization: Bearer x    │                          │                         │
  │ ─────────────────────────► │                          │                         │
  │                            │ (attach to identitySrc)  │                         │
  │                            │ ───────────────────────► │                         │
  │                            │                          │ decode + verify JWT     │
  │                            │                          │ (HS256, jose)           │
  │                            │ ◄─────────────────────── │                         │
  │                            │ {isAuthorized:true,      │                         │
  │                            │  context:{userId,...}}   │                         │
  │                            │ ─────────────────────────────────────────────────► │
  │                            │     event.requestContext.authorizer.lambda.*     │
  │ ◄───────────────────────── │                                                   │
```

## Wiring

The root `template.yaml` references this nested stack via
`AuthorizerStack: Type: AWS::CloudFormation::Stack` and creates an
`AWS::ApiGatewayV2::Authorizer` of type `REQUEST` pointing at the
function.

## IAM permissions

- `ssm:GetParameter` on `/orion/secret/jwt-arn`
- `secretsmanager:GetSecretValue` on the JWT secret (ARN resolved from SSM)
- Lambda basic execution (CloudWatch Logs)

## Dependencies

- `@orion/shared` (from the node-shared Layer)
- `jose` (from the node-runtime Layer)

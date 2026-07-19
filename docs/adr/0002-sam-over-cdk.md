# 0002 - AWS SAM as the IaC tool for the backend

- Status: Accepted (2026-06-30, during repo bootstrap)
- Deciders: @ahincho
- Supersedes: -

## Context and Problem Statement

How do we declare the CloudFormation stack(s) for a serverless DDD+EDA
monolith? Options considered: AWS CDK, Terraform, Pulumi, raw
CloudFormation, AWS SAM. Each has different setup cost, type safety,
local-dev story, and deployment harness.

## Decision

We use **AWS SAM** (`template.yaml` root + nested `template.yaml` per
bounded context) for the application layer (HTTP API v2 + Lambdas +
Layers + EventBridge bus). Network/data layers (VPC, RDS Aurora, state
backend) are owned by the separate `orion-infrastructure` repo
(Terraform) because that is the broader multi-repo convention.

- **Why SAM (not CDK):** SAM templates map 1:1 to CloudFormation, which
  keeps the API surface identical to what AWS exposes, avoids CDK's
  bootstrap/CDKTF overhead, and stays short (each context's stack fits in
  ~150 lines).
- **Why SAM (not raw CFN):** SAM adds `sam local invoke`,
  `sam local start-api`, `sam build`, policy templates, and the
  `samconfig.toml` deploy profile that raw CFN does not have.
- **Why not Terraform:** Terraform for application logic pulls in two
  state files and two deploy tools (one for data plane, one for app plane).
  SAM is the smaller tool for just the Lambda surface.
- **Why split IaC responsibility:** `orion-infrastructure` owns resources
  that span multiple services (RDS proxy, VPC, KMS); coupling those to
  the backend repo would create Terraform-to-SAM drift every release.

## Consequences

### Positive

- `sam build && sam deploy --guided` works the same day the repo is
  cloned.
- One tool for the bootstrap; CDK/Terraform can be added later if a
  better tool is found.
- Local API emulation: `sam local start-api` is good enough for the
  identity/census flows during integration.

### Negative

- SAM policies are noisier than Terraform modules (no `for_each` over
  Lambdas by tag); we accept the YAML verbosity because each bounded
  context only has 1-4 Lambdas.
- Cross-stack wiring (EventBridge bus ARN, secrets ARN) crosses the repo
  boundary; we pass them as env-vars sourced from SSM (via
  `{{resolve:ssm:/orion/...}}` in templates and `createSecretsReader()`
  at runtime).
- Two IaC dialects across the project (SAM here, Terraform in
  infrastructure); documented in repo-onboarding README.

# ORION Backend - Deploy & Operations Notes

Internal documentation for the CI/CD pipeline + bootstrap resources.

## IAM Bootstrap

The `orion-sam-deploy-dev` role is bootstrapped manually (not yet managed by
Terraform). Policy is at `tools/iam-sam-deploy-policy.json` (mirror of
`C:\Users\Angel\AppData\Local\Temp\opencode\policy-orion-backend.json` in
the local dev environment). The bootstrap script `tools/bootstrap-sam-deploy-policy.sh`
applies it via `aws iam put-role-policy`.

### Resource pattern gotchas

The CloudFormation statement was originally:

```json
"Resource": [
  "arn:aws:cloudformation:us-east-1:681526276858:stack/orion-backend-*-dev",
  "arn:aws:cloudformation:us-east-1:681526276858:stack/orion-backend-*-dev/*"
]
```

**This does NOT match the literal stack name `orion-backend-dev`** (the `*`
wildcard requires a non-empty middle segment). `sam deploy` failed with
`AccessDenied: cloudformation:CreateChangeSet` on `stack/orion-backend-dev/*`.

The fix is to add the literal `orion-backend-dev` pattern AND a broader
`orion-backend-*` pattern that covers prod and any future envs.

## SAM CLI gotchas (Phase 1)

SAM CLI 1.137-1.163 has two known issues that we work around:

1. **samconfig.toml parser bug** (1.137-1.163+). SAM CLI parses
   `samconfig.toml` as YAML internally and fails with
   `Error: Unexpected character: 'u' at line 10 col 9` on any non-trivial
   TOML. Workaround: pass `--config-file /tmp/samconfig-bypass.toml`
   (an empty `version = 0.1` file) to override the default load.

2. **Node.js 24.x runtime requires SAM CLI >= 1.162**. Pin
   `aws-actions/setup-sam@v3` with `version: 1.163.0`.

3. **Nested stacks + cross-stack HttpApi routes**. SAM CLI forbids
   `Events: ApiId: !Ref HttpApiId` in nested stacks when `HttpApiId` is a
   string parameter (it requires an in-template
   `AWS::Serverless::HttpApi` resource). Workaround: declare
   `AWS::ApiGatewayV2::Integration` + `AWS::ApiGatewayV2::Route` in the
   **root** template, pointing at the function ARNs exported by each
   nested stack. Each nested stack owns only its Lambda + IAM role.

4. **`!GetAtt X.IntegrationId` not `X.Id`**. The
   `AWS::ApiGatewayV2::Route.Target` attribute references the integration
   via `IntegrationId`, not `Id` (cfn-lint rule E1010).

5. **Workspace packages in nested stack CodeUri**. SAM CLI runs
   `npm install` in each function's CodeUri. If `package.json` lists
   `@orion/shared: "*"` (a workspace package not on the public registry),
   the install fails with 404. Solution: do NOT list workspace packages
   in any function's `package.json` (the workspace symlink in
   `node_modules/@orion/shared` is sufficient for TypeScript imports;
   the runtime layer provides it at execution time).

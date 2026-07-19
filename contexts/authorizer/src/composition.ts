// =============================================================================
// Composition root for the authorizer context
// =============================================================================
// Caches the JWT secret across warm Lambda invocations. The secret ARN
// is read once from SSM (/orion/secret/jwt-arn), the secret value is
// fetched from Secrets Manager and cached in-memory.
// =============================================================================

import { createSsmReader } from '@orion/shared/infra';
import { createSecretsReader } from '@orion/shared/infra';
import { verifyJwt } from '@orion/shared/auth';

export interface AuthorizerContext {
  verify(token: string): Promise<{ userId: string; email: string; role: string } | null>;
}

let cachedContext: AuthorizerContext | null = null;
let pendingPromise: Promise<AuthorizerContext> | null = null;

export async function buildContext(): Promise<AuthorizerContext> {
  if (cachedContext) return cachedContext;
  if (pendingPromise) return pendingPromise;

  pendingPromise = (async () => {
    const ssm = createSsmReader();
    const secrets = createSecretsReader();

    // The SSM parameter holds the ARN of the secret in Secrets Manager.
    // The ARN itself is not sensitive; the value is.
    const secretArn = await ssm.getRequiredString('/orion/secret/jwt-arn');
    const secretValue = await secrets.getRequiredString(secretArn);
    const secretBytes = new TextEncoder().encode(secretValue);

    const ctx: AuthorizerContext = {
      async verify(token: string) {
        try {
          const claims = await verifyJwt(token, secretBytes);
          return {
            userId: claims.sub,
            email: typeof claims.email === 'string' ? claims.email : '',
            role: typeof claims.role === 'string' ? claims.role : '',
          };
        } catch {
          return null;
        }
      },
    };

    cachedContext = ctx;
    return ctx;
  })();
  return pendingPromise;
}

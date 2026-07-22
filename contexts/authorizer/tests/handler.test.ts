import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';
import { handler } from '../src/handler.js';
import * as composition from '../src/composition.js';
import type { AuthorizerContext } from '../src/composition.js';

const verify = vi.fn();
const buildContextSpy = vi.spyOn(composition, 'buildContext');

function makeEvent(authHeader: string | undefined): APIGatewayRequestAuthorizerEventV2 {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers.authorization = authHeader;
  }
  return {
    version: '2.0',
    type: 'REQUEST',
    routeKey: '$default',
    rawPath: '/',
    rawQueryString: '',
    headers,
    requestContext: {
      accountId: '123',
      apiId: 'abc',
      domainName: 'abc.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'abc',
      http: {
        method: 'GET',
        path: '/',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    identitySource: [],
    identityContext: {},
  } as unknown as APIGatewayRequestAuthorizerEventV2;
}

describe('authorizer.handler', () => {
  beforeEach(() => {
    verify.mockReset();
    buildContextSpy.mockReset();
    const ctx: AuthorizerContext = { verify };
    buildContextSpy.mockResolvedValue(ctx);
  });

  it('returns isAuthorized:true with context on a valid Bearer token', async () => {
    verify.mockResolvedValue({ userId: 'u-1', email: 'a@b.com', role: 'advisor' });
    const result = await handler(makeEvent('Bearer abc.def.ghi'));
    expect(result).toEqual({
      isAuthorized: true,
      context: { userId: 'u-1', email: 'a@b.com', role: 'advisor' },
    });
    expect(verify).toHaveBeenCalledWith('abc.def.ghi');
  });

  it('returns isAuthorized:false when verify resolves to null', async () => {
    verify.mockResolvedValue(null);
    const result = await handler(makeEvent('Bearer bad.token'));
    expect(result).toEqual({ isAuthorized: false });
  });

  it('returns isAuthorized:false when the Authorization header is missing', async () => {
    const result = await handler(makeEvent(undefined));
    expect(result).toEqual({ isAuthorized: false });
    expect(buildContextSpy).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns isAuthorized:false when the header does not start with "Bearer "', async () => {
    const result = await handler(makeEvent('Basic dXNlcjpwYXNz'));
    expect(result).toEqual({ isAuthorized: false });
    expect(buildContextSpy).not.toHaveBeenCalled();
  });

  it('treats header as case-insensitive (lowercase key)', async () => {
    verify.mockResolvedValue({ userId: 'u-2', email: 'x@y.com', role: 'supervisor' });
    const event = makeEvent('Bearer tok') as unknown as APIGatewayRequestAuthorizerEventV2;
    (event.headers as Record<string, string>).authorization = 'Bearer tok';
    delete (event.headers as Record<string, string>).Authorization;
    delete (event.headers as Record<string, string>).AUTHORIZATION;
    const result = await handler(event);
    expect(result).toMatchObject({ isAuthorized: true });
  });

  it('treats header as case-insensitive (UPPERCASE key fallback path)', async () => {
    verify.mockResolvedValue({ userId: 'u-3', email: 'k@l.com', role: 'advisor' });
    const event = makeEvent('Bearer tok') as unknown as APIGatewayRequestAuthorizerEventV2;
    delete (event.headers as Record<string, string>).authorization;
    (event.headers as Record<string, string>).AUTHORIZATION = 'Bearer tok';
    const result = await handler(event);
    expect(result).toMatchObject({ isAuthorized: true });
  });

  it('returns isAuthorized:false on "Bearer " with empty token', async () => {
    verify.mockResolvedValue(null);
    const result = await handler(makeEvent('Bearer '));
    expect(result).toEqual({ isAuthorized: false });
    expect(verify).toHaveBeenCalledWith('');
  });

  it('forwards token only (strips the "Bearer " prefix)', async () => {
    verify.mockResolvedValue({ userId: 'u-4', email: 'q@w.com', role: 'advisor' });
    await handler(makeEvent('Bearer some.jwt.value'));
    expect(verify).toHaveBeenCalledWith('some.jwt.value');
    expect(verify).not.toHaveBeenCalledWith('Bearer some.jwt.value');
  });

  it('propagates exceptions from buildContext (e.g. SSM down on cold start)', async () => {
    buildContextSpy.mockRejectedValue(new Error('SSM unavailable'));
    await expect(handler(makeEvent('Bearer x.y.z'))).rejects.toThrow('SSM unavailable');
  });
});
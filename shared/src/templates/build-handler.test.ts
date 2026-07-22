import { describe, it, expect, vi } from 'vitest';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { buildHandler } from './build-handler.js';
import { z } from 'zod';

const inputSchema = z.object({ name: z.string() });

const logger = new Logger({ serviceName: 'test' });
const tracer = new Tracer({ serviceName: 'test' });

function makeEvent(
  body: object | null,
  authContext?: Record<string, string>,
): Parameters<ReturnType<typeof buildHandler>>[0] {
  return {
    version: '2.0',
    routeKey: 'POST /test',
    rawPath: '/test',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '123',
      apiId: 'abc',
      domainName: 'abc.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'abc',
      http: {
        method: 'POST',
        path: '/test',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'req-test-123',
      routeKey: 'POST /test',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      ...(authContext ? { authorizer: { lambda: authContext } } : {}),
    },
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
  } as unknown as Parameters<ReturnType<typeof buildHandler>>[0];
}

describe('buildHandler', () => {
  it('calls handler with parsed input on valid body', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = buildHandler({
      inputSchema,
      handler,
      logger,
      tracer,
      requireAuth: false,
      enableCors: false,
    });

    const result = await (
      wrapped as unknown as (e: unknown) => Promise<{ statusCode: number; body: string }>
    )(makeEvent({ name: 'Alice' }));

    expect(result.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledWith({ name: 'Alice' }, expect.anything(), undefined);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ ok: true });
  });

  it('returns 400 on invalid body', async () => {
    const handler = vi.fn();
    const wrapped = buildHandler({
      inputSchema,
      handler,
      logger,
      tracer,
      enableCors: false,
    });

    const result = await (
      wrapped as unknown as (e: unknown) => Promise<{ statusCode: number; body: string }>
    )(makeEvent({ name: 123 }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('bad_request');
    expect(handler).not.toHaveBeenCalled();
  });

  it('throws 401 when requireAuth=true and no authorizer context', async () => {
    const handler = vi.fn();
    const wrapped = buildHandler({
      inputSchema,
      handler,
      logger,
      tracer,
      requireAuth: true,
      enableCors: false,
    });

    const result = await (
      wrapped as unknown as (e: unknown) => Promise<{ statusCode: number; body: string }>
    )(makeEvent({ name: 'Alice' }));

    expect(result.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes AuthContext to handler when requireAuth=true and authorizer set', async () => {
    const handler = vi.fn().mockResolvedValue({ id: 'x' });
    const wrapped = buildHandler({
      inputSchema,
      handler,
      logger,
      tracer,
      requireAuth: true,
      enableCors: false,
    });

    await (wrapped as unknown as (e: unknown) => Promise<{ statusCode: number }>)(
      makeEvent({ name: 'Alice' }, { userId: 'u-1', email: 'a@b.com', role: 'advisor' }),
    );

    expect(handler).toHaveBeenCalledWith(
      { name: 'Alice' },
      expect.anything(),
      expect.objectContaining({ userId: 'u-1', email: 'a@b.com', role: 'advisor' }),
    );
  });
});

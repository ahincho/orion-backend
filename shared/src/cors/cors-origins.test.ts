import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCorsOrigins, getCorsOptions, invalidateCorsCache } from './cors-origins.js';

const mockGetRequiredString = vi.fn();

vi.mock('../infra/ssm-reader.js', () => ({
  createSsmReader: () => ({
    getRequiredString: mockGetRequiredString,
    getString: mockGetRequiredString,
    getJson: mockGetRequiredString,
    invalidate: vi.fn(),
  }),
}));

describe('cors-origins', () => {
  beforeEach(() => {
    mockGetRequiredString.mockReset();
    invalidateCorsCache();
  });

  afterEach(() => {
    invalidateCorsCache();
  });

  it('parses comma-separated origins and trims whitespace', async () => {
    mockGetRequiredString.mockResolvedValue('http://localhost:4200, https://app.example.com ,http://localhost:3000');
    const origins = await getCorsOrigins();
    expect(origins).toEqual([
      'http://localhost:4200',
      'https://app.example.com',
      'http://localhost:3000',
    ]);
  });

  it('returns empty array when SSM value is empty', async () => {
    mockGetRequiredString.mockResolvedValue('');
    const origins = await getCorsOrigins();
    expect(origins).toEqual([]);
  });

  it('getCorsOptions includes CORS headers and methods', async () => {
    mockGetRequiredString.mockResolvedValue('http://localhost:4200');
    const opts = await getCorsOptions();
    expect(opts.origin).toEqual(['http://localhost:4200']);
    expect(opts.credentials).toBe(true);
    expect(opts.headers).toContain('Authorization');
    expect(opts.methods).toContain('POST');
    expect(opts.exposeHeaders).toContain('X-Correlation-Id');
  });

  it('caches origins within TTL', async () => {
    mockGetRequiredString.mockResolvedValue('http://localhost:4200');
    await getCorsOrigins();
    await getCorsOrigins();
    await getCorsOrigins();
    expect(mockGetRequiredString).toHaveBeenCalledTimes(1);
  });

  it('invalidateCorsCache forces re-fetch', async () => {
    mockGetRequiredString.mockResolvedValue('http://localhost:4200');
    await getCorsOrigins();
    invalidateCorsCache();
    await getCorsOrigins();
    expect(mockGetRequiredString).toHaveBeenCalledTimes(2);
  });
});

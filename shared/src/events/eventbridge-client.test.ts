import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventBridgeClient, makeDomainEvent } from './eventbridge-client.js';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: vi.fn(function () {
    return { send: sendMock };
  }),
  PutEventsCommand: vi.fn(function (input: unknown) {
    return { input };
  }),
}));

describe('createEventBridgeClient', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('publish() succeeds on first attempt', async () => {
    sendMock.mockResolvedValue({ FailedEntryCount: 0, Entries: [{}] });
    const publisher = createEventBridgeClient({ busArn: 'arn:bus' });
    const event = makeDomainEvent('orion.test', 'ThingCreated', { id: 't-1' });
    await expect(publisher.publish(event)).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('publish() retries on transient failure then succeeds', async () => {
    sendMock
      .mockRejectedValueOnce(new Error('throttled'))
      .mockResolvedValueOnce({ FailedEntryCount: 0, Entries: [{}] });
    const publisher = createEventBridgeClient({ busArn: 'arn:bus' });
    await expect(
      publisher.publish(makeDomainEvent('orion.test', 'X', { id: '1' })),
    ).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('publish() throws after 3 failed attempts', async () => {
    sendMock.mockRejectedValue(new Error('persistent failure'));
    const publisher = createEventBridgeClient({ busArn: 'arn:bus' });
    await expect(publisher.publish(makeDomainEvent('orion.test', 'X', {}))).rejects.toThrow(
      'persistent failure',
    );
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it('publish() throws when FailedEntryCount > 0', async () => {
    sendMock.mockResolvedValue({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'InvalidParameter', ErrorMessage: 'bad source' }],
    });
    const publisher = createEventBridgeClient({ busArn: 'arn:bus' });
    await expect(publisher.publish(makeDomainEvent('orion.test', 'X', {}))).rejects.toThrow(
      /Partial batch failure/,
    );
  });

  it('publishMany() chunks >10 events into multiple calls', async () => {
    sendMock.mockResolvedValue({ FailedEntryCount: 0, Entries: [{}] });
    const publisher = createEventBridgeClient({ busArn: 'arn:bus' });
    const events = Array.from({ length: 25 }, (_, i) =>
      makeDomainEvent('orion.test', 'Bulk', { i }),
    );
    await publisher.publishMany(events);
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it('publishMany() retries partial failure on subsequent attempt', async () => {
    sendMock
      .mockResolvedValueOnce({ FailedEntryCount: 1, Entries: [{ ErrorCode: 'X' }] })
      .mockResolvedValueOnce({ FailedEntryCount: 0, Entries: [{}] });
    const publisher = createEventBridgeClient({ busArn: 'arn:bus' });
    await expect(
      publisher.publishMany([makeDomainEvent('orion.test', 'X', {})]),
    ).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

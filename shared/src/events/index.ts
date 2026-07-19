export {
  createEventBridgeClient,
  makeDomainEvent,
  type EventBridgeConfig,
  type EventPublisher,
} from './eventbridge-client.js';
export { validatePayload } from './schema-validator.js';
export { type DomainEvent, type EventDetail } from './types.js';

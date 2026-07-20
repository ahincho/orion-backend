// =============================================================================
// @orion/shared - barrel export
// =============================================================================
// Public surface of the shared kernel. Contexts import from subpaths:
//   import { ApiError } from '@orion/shared/http';
//   import { createEventBridgeClient } from '@orion/shared/events';
//   import { buildHandler } from '@orion/shared/templates';
// =============================================================================

export * from './auth/index.js';
export * from './http/index.js';
export * from './events/index.js';
export * from './infra/index.js';
export * from './logger/index.js';
export * from './cors/index.js';
export * from './templates/index.js';

export const SHARED_VERSION = '0.1.4';

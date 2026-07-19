// =============================================================================
// Domain events emitted by the census context
// =============================================================================

import { z } from 'zod';

export const CensusAssignedEventSchema = z.object({
  assignmentId: z.string().uuid(),
  homeId: z.string().uuid(),
  assigneeId: z.string().uuid(),
  assignedBy: z.string().uuid(),
  scheduledDate: z.string(),
});
export type CensusAssignedEvent = z.infer<typeof CensusAssignedEventSchema>;

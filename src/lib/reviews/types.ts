import "server-only";

import type { MessagePresentation } from "@/lib/presentation";

export type ReviewAssignment = "queue" | "hand_picked";

export type ReviewTargetKind = "message" | "seed";

export interface ReviewAssignmentPayload {
  assignment: ReviewAssignment;
  kind: ReviewTargetKind;
  messageId?: string;
  seedCaseId?: string;
  presentation: MessagePresentation;
}

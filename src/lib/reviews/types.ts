import "server-only";

import type { MessagePresentation } from "@/lib/presentation";

export type ReviewAssignment = "queue" | "hand_picked";

export type ReviewTargetKind = "message" | "seed";

export interface ReviewAssignmentPayload {
  /** Opaque id the submit step must return to consume server provenance (#16). */
  assignmentId: string;
  assignment: ReviewAssignment;
  kind: ReviewTargetKind;
  messageId?: string;
  seedCaseId?: string;
  presentation: MessagePresentation;
}

"use client";

import { useSearchParams } from "next/navigation";

import { JudgePanel } from "./judge-panel";

export function JudgePageClient() {
  const searchParams = useSearchParams();
  const messageId = searchParams.get("messageId");
  return <JudgePanel messageId={messageId} returnToDraft={searchParams.get("returnTo") === "draft"} />;
}

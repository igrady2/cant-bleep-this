import { FlaskConical, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ModerationProvider } from "@/lib/moderation/types";

export function ProviderBadge({ provider }: { provider: ModerationProvider }) {
  if (provider === "typesafe") {
    return (
      <Badge
        variant="secondary"
        className="shrink-0 gap-1 border border-brand-blue/30 bg-secondary px-2.5 py-1 text-secondary-foreground"
        title="Every message is checked by Jev, TypeSafe AI's System One model, before it's posted."
      >
        <ShieldCheck aria-hidden />
        <span className="hidden sm:inline">Moderated by</span> Jev
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="shrink-0 gap-1 border-dashed border-amber-500 bg-amber-50 px-2.5 py-1 text-amber-900"
      title="TYPESAFE_API_KEY is not set, so a local keyword mock stands in for Jev."
    >
      <FlaskConical aria-hidden />
      Demo
    </Badge>
  );
}

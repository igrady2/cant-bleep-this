import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function ProviderBadge() {
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

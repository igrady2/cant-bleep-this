import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function RulesLink({
  className,
  children = "Rules and Terms of Use",
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link href="/rules" className={cn("text-primary underline-offset-4 hover:underline", className)}>
      {children}
    </Link>
  );
}

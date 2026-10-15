import Link from "next/link";

import { TermsContent } from "@/components/rules/terms-content";
import { Button } from "@/components/ui/button";

export default function RulesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl justify-end px-4 pt-4 sm:px-6">
        <Button variant="outline" size="sm" render={<Link href="/" />}>
          Back
        </Button>
      </div>
      <TermsContent />
    </div>
  );
}

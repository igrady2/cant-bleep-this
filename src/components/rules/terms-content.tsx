import {
  OFF_LIMITS_POLICY,
  POLICY_VERSION,
  REVIEW_RULES,
  TERMS_INTRO,
} from "@/lib/terms/public-rules";

export function TermsContent() {
  return (
    <article className="prose-rules mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Policy {POLICY_VERSION}
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Rules and Terms of Use
        </h1>
        <p className="text-pretty text-muted-foreground">{TERMS_INTRO}</p>
      </header>

      <section className="space-y-4 rounded-xl border border-border bg-muted/40 p-5">
        <h2 className="font-heading text-xl font-semibold">{OFF_LIMITS_POLICY.title}</h2>
        <p className="text-pretty text-sm text-muted-foreground">{OFF_LIMITS_POLICY.body}</p>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold">Reviewable rules</h2>
        <p className="text-sm text-muted-foreground">
          When you judge a message as Not OK, you choose one of these rules. The filter uses the same
          categories.
        </p>
        <ol className="space-y-4">
          {REVIEW_RULES.map((rule, index) => (
            <li
              key={rule.id}
              id={rule.id}
              className="scroll-mt-6 rounded-xl border border-border bg-card px-4 py-3 sm:px-5"
            >
              <h3 className="font-heading font-semibold">
                {index + 1}. {rule.label}
              </h3>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">{rule.summary}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <p>
          Phone numbers, email addresses, and long digit runs are masked before anyone sees a
          message, including reviewers.
        </p>
        <p>
          By playing, you confirm you are 18 or older and agree to follow these rules in the shared
          room.
        </p>
      </section>
    </article>
  );
}

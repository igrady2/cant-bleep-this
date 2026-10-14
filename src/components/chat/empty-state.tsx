import { MessagesSquare } from "lucide-react";

export function EmptyState() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center py-8 text-center sm:py-14">
      <span className="grid size-14 place-items-center rounded-full bg-accent text-brand-pink">
        <MessagesSquare className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Class forum
      </h1>
      <p className="mt-3 text-pretty text-muted-foreground">
        Ask a question, cheer on a classmate, or start a conversation. Every message is checked
        before it&apos;s posted so the forum stays safe for students and teachers.
      </p>
      <div className="mt-8 w-full rounded-xl border border-border bg-muted/50 px-5 py-4 text-left text-sm">
        <p className="font-heading font-semibold">Test the filter</p>
        <p className="mt-1 text-pretty text-muted-foreground">
          Try messages across the spectrum: something clearly kind, something borderline (like
          mild teasing or asking a friend for homework help), and something clearly out of line.
          Allowed messages appear in the chat. Blocked ones show which rule they broke and why.
        </p>
      </div>
    </section>
  );
}

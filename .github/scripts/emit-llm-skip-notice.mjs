/**
 * Emit a GitHub Actions workflow notice without shell-interpreting PR-derived text.
 */
const headRepo = process.env.PR_HEAD_REPO ?? "";
const repository = process.env.GITHUB_REPOSITORY ?? "";
const skipReason = process.env.SKIP_REASON ?? "";

const message =
  headRepo !== repository
    ? "Fork pull requests cannot use repository review secrets."
    : skipReason;

process.stdout.write(`::notice title=LLM review skipped::${message}\n`);

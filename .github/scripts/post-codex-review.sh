#!/usr/bin/env bash
set -euo pipefail

REVIEW_FILE="${1:-codex-review.md}"
if [[ ! -s "$REVIEW_FILE" ]]; then
  echo "::warning::Codex produced no review output."
  exit 0
fi

BODY=$(printf '## Automated PR review (Codex CLI)\n\n%s\n\n---\n*Subscription Codex CLI via `CODEX_AUTH_JSON` — not an OpenAI API key.*' "$(cat "$REVIEW_FILE")")

gh pr review "${GITHUB_PULL_REQUEST_NUMBER}" --comment --body "$BODY"

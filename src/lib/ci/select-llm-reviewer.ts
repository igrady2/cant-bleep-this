export type LlmReviewer = "claude" | "codex" | "skip";

export type SelectLlmReviewerInput = {
  prBody: string;
  hasClaudeSecret: boolean;
  hasCodexSecret: boolean;
};

export type SelectLlmReviewerResult = {
  reviewer: LlmReviewer;
  reason: string;
  builtByLlm: string;
  reviewedByTool: "Claude Code" | "Codex" | "";
  reviewedByLlm: string;
};

/** Parse the Built by LLM field from a pull request body (markdown). */
export function parseBuiltByLlm(prBody: string): string {
  const body = prBody.replace(/<!--[\s\S]*?-->/g, "").trim();
  const match = body.match(
    /^##\s*Built by LLM\s*\n+([\s\S]*?)(?=\n##\s|\n*$)/im,
  );
  if (!match) {
    return "";
  }
  return match[1].trim().split("\n")[0]?.trim() ?? "";
}

export function modelFamily(
  builtByLlm: string,
): "claude" | "codex" | "composer" | "grok" | "unknown" {
  const n = builtByLlm.toLowerCase();
  if (!n || n === "concrete model name.") {
    return "unknown";
  }
  if (/\bclaude\b|anthropic/.test(n)) {
    return "claude";
  }
  if (/\bcodex\b|chatgpt|\bgpt[- ]?\d/.test(n)) {
    return "codex";
  }
  if (/\bcomposer\b/.test(n)) {
    return "composer";
  }
  if (/\bgrok\b/.test(n)) {
    return "grok";
  }
  return "unknown";
}

function reviewerConflictsWithBuilder(
  reviewer: Exclude<LlmReviewer, "skip">,
  family: ReturnType<typeof modelFamily>,
): boolean {
  if (family === "unknown" || family === "composer" || family === "grok") {
    return false;
  }
  return reviewer === family;
}

/**
 * Choose Claude Code or Codex CLI for subscription-based PR review.
 * Never selects Grok or Cursor cloud agents.
 */
export function selectLlmReviewer(
  input: SelectLlmReviewerInput,
): SelectLlmReviewerResult {
  const builtByLlm = parseBuiltByLlm(input.prBody);
  const family = modelFamily(builtByLlm);

  const available: Array<Exclude<LlmReviewer, "skip">> = [];
  if (input.hasClaudeSecret) {
    available.push("claude");
  }
  if (input.hasCodexSecret) {
    available.push("codex");
  }

  if (available.length === 0) {
    return {
      reviewer: "skip",
      reason:
        "No review credentials: set CLAUDE_CODE_OAUTH_TOKEN (claude setup-token) and/or CODEX_AUTH_JSON (ChatGPT sign-in export). API keys are not used.",
      builtByLlm,
      reviewedByTool: "",
      reviewedByLlm: "",
    };
  }

  const eligible = available.filter(
    (r) => !reviewerConflictsWithBuilder(r, family),
  );

  if (eligible.length === 0) {
    const only = available[0];
    return {
      reviewer: "skip",
      reason: `Only ${only === "claude" ? "Claude Code" : "Codex"} is configured, but Built by LLM (“${builtByLlm}”) requires a different reviewer per PROCESS.md.`,
      builtByLlm,
      reviewedByTool: "",
      reviewedByLlm: "",
    };
  }

  const reviewer = eligible.includes("claude") ? "claude" : eligible[0];
  const reviewedByTool = reviewer === "claude" ? "Claude Code" : "Codex";
  const reviewedByLlm =
    reviewer === "claude" ? "Claude (subscription CLI)" : "Codex (subscription CLI)";

  return {
    reviewer,
    reason: `Built by LLM family: ${family}; selected ${reviewedByTool}.`,
    builtByLlm,
    reviewedByTool,
    reviewedByLlm,
  };
}

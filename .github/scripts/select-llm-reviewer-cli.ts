import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { selectLlmReviewer } from "../../src/lib/ci/select-llm-reviewer";

const prBody = process.env.PR_BODY ?? "";
const hasClaudeSecret = process.env.HAS_CLAUDE_SECRET === "true";
const hasCodexSecret = process.env.HAS_CODEX_SECRET === "true";

const result = selectLlmReviewer({
  prBody,
  hasClaudeSecret,
  hasCodexSecret,
});

const outputPath = process.env.GITHUB_OUTPUT;
if (!outputPath) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

function writeMultilineOutput(key: string, value: string) {
  const delimiter = randomUUID();
  appendFileSync(
    outputPath!,
    `${key}<<${delimiter}\n${value}\n${delimiter}\n`,
  );
}

writeMultilineOutput("reviewer", result.reviewer);
writeMultilineOutput("reason", result.reason);
writeMultilineOutput("built_by_llm", result.builtByLlm);
writeMultilineOutput("reviewed_by_tool", result.reviewedByTool);
writeMultilineOutput("reviewed_by_llm", result.reviewedByLlm);

console.log(result.reason);

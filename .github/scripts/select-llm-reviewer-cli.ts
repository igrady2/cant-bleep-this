import { appendFileSync } from "node:fs";
import { selectLlmReviewer } from "../../src/lib/ci/select-llm-reviewer";

const prBody = process.env.PR_BODY ?? "";
const hasClaudeSecret = Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim());
const hasCodexSecret = Boolean(process.env.CODEX_AUTH_JSON?.trim());

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

appendFileSync(
  outputPath,
  [
    `reviewer=${result.reviewer}`,
    `reason<<EOF`,
    result.reason,
    `EOF`,
    `built_by_llm<<EOF`,
    result.builtByLlm,
    `EOF`,
    `reviewed_by_tool<<EOF`,
    result.reviewedByTool,
    `EOF`,
    `reviewed_by_llm<<EOF`,
    result.reviewedByLlm,
    `EOF`,
    "",
  ].join("\n"),
);

console.log(result.reason);

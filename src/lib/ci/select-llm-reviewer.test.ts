import { describe, expect, it } from "vitest";
import {
  modelFamily,
  parseBuiltByLlm,
  selectLlmReviewer,
} from "./select-llm-reviewer";

const templateBody = `## Closes

Closes #1

## Built by model

Tool: Cursor

## Built by LLM

Composer 2.5

## Reviewed by model

Tool: TBD

## Reviewed by LLM

TBD
`;

describe("parseBuiltByLlm", () => {
  it("reads the first line under Built by LLM", () => {
    expect(parseBuiltByLlm(templateBody)).toBe("Composer 2.5");
  });
});

describe("modelFamily", () => {
  it("classifies composer and codex", () => {
    expect(modelFamily("Composer 2.5")).toBe("composer");
    expect(modelFamily("gpt-5.4-codex")).toBe("codex");
    expect(modelFamily("Claude Sonnet 4")).toBe("claude");
  });
});

describe("selectLlmReviewer", () => {
  it("prefers Claude when both secrets exist and builder is Composer", () => {
    const result = selectLlmReviewer({
      prBody: templateBody,
      hasClaudeSecret: true,
      hasCodexSecret: true,
    });
    expect(result.reviewer).toBe("claude");
  });

  it("uses Codex when only Codex is configured and builder is Composer", () => {
    const result = selectLlmReviewer({
      prBody: templateBody,
      hasClaudeSecret: false,
      hasCodexSecret: true,
    });
    expect(result.reviewer).toBe("codex");
  });

  it("skips when only Claude is configured but builder is Claude", () => {
    const body = templateBody.replace("Composer 2.5", "Claude Opus 4");
    const result = selectLlmReviewer({
      prBody: body,
      hasClaudeSecret: true,
      hasCodexSecret: false,
    });
    expect(result.reviewer).toBe("skip");
  });

  it("picks Codex when builder is Claude and both secrets exist", () => {
    const body = templateBody.replace("Composer 2.5", "Claude Opus 4");
    const result = selectLlmReviewer({
      prBody: body,
      hasClaudeSecret: true,
      hasCodexSecret: true,
    });
    expect(result.reviewer).toBe("codex");
  });

  it("skips when no secrets", () => {
    const result = selectLlmReviewer({
      prBody: templateBody,
      hasClaudeSecret: false,
      hasCodexSecret: false,
    });
    expect(result.reviewer).toBe("skip");
  });
});

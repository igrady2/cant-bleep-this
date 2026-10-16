import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TriageItem, TriageView } from "@/lib/admin/triage-types";
import { TriageBoard } from "./triage-board";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const item = (id: string, overrides: Partial<TriageItem> = {}): TriageItem => ({
  id,
  message: `message ${id}`,
  context: [{ username: "Player A", text: "earlier line" }],
  reasons: [`reason ${id}`],
  scores: [{ rule: "profanity", label: "Profanity", score: 0.31 }],
  filterVersion: "v1",
  versionAdded: "v1",
  tags: [],
  patchedIn: null,
  ...overrides,
});

const slips: TriageView = {
  kind: "slip",
  counts: { slip: 2, false_positive: 1 },
  groups: [
    { rule: "profanity", label: "Profanity", items: [item("s1"), item("s2", { tags: ["spelling"], patchedIn: "v2" })] },
  ],
};
const falsePositives: TriageView = {
  kind: "false_positive",
  counts: { slip: 2, false_positive: 1 },
  groups: [{ rule: "sexual_content", label: "Sexual content", items: [item("f1", { reasons: [] })] }],
};

function stubApi() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/admin/triage/tags")) {
      const body = JSON.parse(String(init?.body)) as { tags: string[] };
      return Response.json({ testCaseId: "s1", tags: body.tags });
    }
    return Response.json(url.includes("false_positive") ? falsePositives : slips);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("groups slips by rule with context, reasons, scores and version", async () => {
  stubApi();
  render(<TriageBoard />);
  expect(await screen.findByRole("heading", { name: /Profanity/ })).toBeTruthy();
  const cards = screen.getAllByTestId("triage-item");
  expect(cards).toHaveLength(2);
  expect(cards[0].textContent).toContain("Player A: earlier line");
  expect(cards[0].textContent).toContain("message s1");
  expect(cards[0].textContent).toContain("reason s1");
  expect(cards[0].textContent).toContain("Profanity 0.31");
  expect(cards[0].textContent).toContain("Filter version v1");
  expect(screen.getByRole("tab", { name: "Slips (2)" }).getAttribute("aria-selected")).toBe("true");
});

it("has a false positives tab", async () => {
  const fetchMock = stubApi();
  render(<TriageBoard />);
  await userEvent.click(await screen.findByRole("tab", { name: "False positives (1)" }));
  expect(await screen.findByRole("heading", { name: /Sexual content/ })).toBeTruthy();
  expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/triage?kind=false_positive", expect.anything());
  expect(screen.getByRole("tab", { name: "False positives (1)" }).getAttribute("aria-selected")).toBe("true");
});

it("filters by tag and untagged", async () => {
  stubApi();
  render(<TriageBoard />);
  await screen.findAllByTestId("triage-item");
  await userEvent.selectOptions(screen.getByRole("combobox"), "untagged");
  expect(screen.getAllByTestId("triage-item").map((card) => card.textContent)).toEqual([expect.stringContaining("message s1")]);
  await userEvent.selectOptions(screen.getByRole("combobox"), "spelling");
  expect(screen.getAllByTestId("triage-item").map((card) => card.textContent)).toEqual([expect.stringContaining("message s2")]);
  await userEvent.selectOptions(screen.getByRole("combobox"), "sound");
  expect(screen.getByText("Nothing to triage here yet.")).toBeTruthy();
});

it("toggles a tag through the API", async () => {
  const fetchMock = stubApi();
  render(<TriageBoard />);
  const [first] = await screen.findAllByTestId("triage-item");
  const meaning = within(first).getByRole("button", { name: "meaning" });
  expect(meaning.getAttribute("aria-pressed")).toBe("false");
  await userEvent.click(meaning);
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/triage/tags", expect.objectContaining({
    method: "POST", body: JSON.stringify({ testCaseId: "s1", tags: ["meaning"] }),
  }));
  expect((await within(first).findByRole("button", { name: "meaning", pressed: true })).getAttribute("aria-pressed")).toBe("true");
});

it("shows an error when the API denies access", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
  render(<TriageBoard />);
  expect((await screen.findByRole("alert")).textContent).toContain("unavailable");
});

it("marks slips a released version now catches", async () => {
  stubApi();
  render(<TriageBoard />);
  const cards = await screen.findAllByTestId("triage-item");
  expect(cards[0].textContent).not.toContain("Patched in");
  expect(cards[1].textContent).toContain("Patched in v2");
});
